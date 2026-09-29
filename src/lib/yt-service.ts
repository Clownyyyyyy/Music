/**
 * yt-service client (server-side only). Thin HTTP client around the
 * Python ytmusicapi sidecar (mini-services/yt-service) — the REAL data
 * source for every song, album, artist, playlist, chart and mood.
 *
 * Uses node:http directly (one-shot connections) instead of global fetch:
 * Next.js patches fetch, and its pooled connections can hang against the
 * sidecar after a restart. One-shot sockets are immune to that.
 *
 * Self-healing: every request first probes the sidecar; if it is down we
 * spawn it as a detached child of this (long-lived) server process and wait
 * for health before retrying. Duplicate spawns self-resolve — only one
 * uvicorn can bind :3031, the losers exit immediately.
 */
import * as http from "node:http";
import * as https from "node:https";
import * as fs from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const BASE = process.env.YT_SERVICE_URL || "http://127.0.0.1:3031";
const SIDECAR_DIR = process.env.YT_SERVICE_DIR || path.join(process.cwd(), "mini-services", "yt-service");
const PYTHON = process.env.YT_SERVICE_PY || "/home/z/.venv/bin/python3";

export class YtServiceError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/* ---------------------------------------------------------- self-heal --- */

function probeHealth(timeoutMs = 900): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL("/health", BASE);
    const req = http.get(url, { timeout: timeoutMs, headers: { accept: "application/json" } }, (res) => {
      res.resume();
      resolve((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500);
    });
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.on("error", () => resolve(false));
  });
}

let healing: Promise<boolean> | null = null;
let lastSpawnAt = 0;

function spawnSidecar(): void {
  // Throttle: never spawn more than once per 4s across recompiles/workers.
  const now = Date.now();
  if (now - lastSpawnAt < 4_000) return;
  lastSpawnAt = now;
  try {
    // Log to a file (append) instead of /dev/null — a silent sidecar cost us
    // diagnosis time more than once; the file is mini-services/yt-service/yt-service.log
    let out: number;
    try {
      out = fs.openSync(path.join(SIDECAR_DIR, "yt-service.log"), "a");
    } catch {
      out = "ignore" as unknown as number;
    }
    const child = spawn(
      PYTHON,
      ["-m", "uvicorn", "app:app", "--host", "127.0.0.1", "--port", "3031", "--log-level", "info"],
      { cwd: SIDECAR_DIR, detached: true, stdio: ["ignore", out, out] }
    );
    child.unref();
    console.log("[yt-service] spawned sidecar pid", child.pid);
  } catch (e) {
    console.error("[yt-service] spawn failed:", (e as Error).message);
  }
}

/** Ensure the sidecar is alive; revive + warm-wait if not. Resolves true when healthy. */
async function ensureSidecar(): Promise<boolean> {
  if (await probeHealth()) return true;
  if (!healing) {
    healing = (async () => {
      spawnSidecar();
      // uvicorn boots + imports ytmusicapi in ~1.5-3s; give it up to 15s.
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (await probeHealth(700)) return true;
      }
      return false;
    })().finally(() => { healing = null; });
  }
  return healing;
}

/* ------------------------------------------------------------- request --- */

async function request<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, timeoutMs = 14_000): Promise<T> {
  const url = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  const started = Date.now();
  try {
    const body = await httpGet(url, timeoutMs);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[yt-service] ${path} ${Date.now() - started}ms`);
    }
    return JSON.parse(body) as T;
  } catch (e) {
    const err = e as Error;
    // Connection refused / reset → the sidecar died; revive it once and retry
    // the SAME request before giving up. Keeps the UI alive across sidecar
    // crashes without any manual babysitting.
    const dead = /ECONNREFUSED|ECONNRESET|socket hang up|timed out/i.test(err.message);
    if (dead && (await ensureSidecar())) {
      try {
        const body = await httpGet(url, timeoutMs);
        console.log(`[yt-service] ${path} recovered ${Date.now() - started}ms`);
        return JSON.parse(body) as T;
      } catch {
        /* fall through to the original error */
      }
    }
    throw new YtServiceError(`yt-service ${path} failed: ${err.message}`, 503);
  }
}

/** One-shot HTTP(S) GET with timeout; resolves the body or rejects. */
function httpGet(url: URL, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      { timeout: timeoutMs, headers: { accept: "application/json" } },
      (res) => {
        const status = res.statusCode || 0;
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => { body += chunk; });
        res.on("end", () => {
          if (status >= 200 && status < 300) resolve(body);
          else reject(new YtServiceError(`status ${status}: ${body.slice(0, 200)}`, status));
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timed out")));
    req.on("error", (err) => {
      if (err instanceof YtServiceError) reject(err);
      else reject(new YtServiceError(err.message, 503));
    });
  });
}

export const ytService = {
  ensureSidecar,
  health: () => request<{ status: string }>("/health"),
  search: (query: string, filter?: string, limit = 20, ignoreSpelling = false) =>
    request<Record<string, any>[]>("/search", { query, filter, limit, ignore_spelling: ignoreSpelling || undefined }, 12_000),
  suggestions: (query: string) =>
    request<string[] | Record<string, any>[]>("/suggestions", { query, detailed: true }, 8_000),
  home: (limit = 4) => request<Record<string, any>[]>("/home", { limit }, 14_000),
  song: (videoId: string) => request<Record<string, any>>(`/song/${videoId}`, {}, 10_000),
  album: (browseId: string) => request<Record<string, any>>(`/album/${browseId}`, {}, 15_000),
  artist: (browseId: string) => request<Record<string, any>>(`/artist/${browseId}`, {}, 15_000),
  artistAlbums: (browseId: string, params: string, limit = 100) =>
    request<Record<string, any>[]>(`/artist/${browseId}/albums`, { params, limit }, 15_000),
  watch: (opts: { videoId?: string; playlistId?: string; radio?: boolean; shuffle?: boolean; limit?: number }) =>
    request<Record<string, any>>("/watch", opts, 15_000),
  playlist: (playlistId: string, limit = 100, related = false, timeoutMs = 20_000) =>
    request<Record<string, any>>(`/playlist/${playlistId}`, { limit, related }, timeoutMs),
  lyrics: (videoId: string) => request<{ lyrics?: string; hasTimestamps?: boolean } | null>(`/lyrics/${videoId}`, {}, 8_000),
  moodCategories: () => request<Record<string, any>>("/moods/categories", {}, 12_000),
  moodPlaylists: (params: string, limit = 100) =>
    request<Record<string, any>[]>("/moods/playlists", { params, limit }, 14_000),
  charts: (country = "ZZ") => request<Record<string, any>>("/charts", { country }, 14_000),
};
