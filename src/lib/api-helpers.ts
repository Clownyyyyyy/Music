/** Shared server helpers for API routes. */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Song } from "@/lib/types";

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(message: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Wrap a handler so yt-service outages degrade gracefully instead of 500ing the UI. */
export async function safe(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    const err = e as Error;
    return apiError(err.message || "request failed", 502);
  }
}

/** Upsert a track metadata snapshot (so local views render without re-fetching). */
export async function upsertTrack(song: Partial<Song> & { videoId: string }): Promise<void> {
  if (!song?.videoId || !song.title) return;
  const artists = Array.isArray(song.artists) ? song.artists : [];
  await db.track.upsert({
    where: { videoId: song.videoId },
    create: {
      videoId: song.videoId,
      title: song.title,
      artistName: song.artistName || artists[0]?.name || "Unknown artist",
      artistsJson: JSON.stringify(artists),
      albumTitle: song.albumTitle || song.album?.name || null,
      albumId: song.albumId || song.album?.id || null,
      cover: song.cover || null,
      duration: song.duration || "",
      durationSeconds: song.duration_seconds ?? 0,
    },
    update: {
      title: song.title,
      artistName: song.artistName || artists[0]?.name || "Unknown artist",
      artistsJson: JSON.stringify(artists),
      albumTitle: song.albumTitle || song.album?.name || null,
      albumId: song.albumId || song.album?.id || null,
      cover: song.cover || null,
      duration: song.duration || "",
      durationSeconds: song.duration_seconds ?? 0,
    },
  });
}

/** Rebuild a Song DTO from the local snapshot (client-safe shape). */
export function snapshotToSong(row: {
  videoId: string; title: string; artistName: string; artistsJson: string;
  albumTitle: string | null; albumId: string | null; cover: string | null;
  duration: string; durationSeconds: number;
}): Song {
  let artists: { name: string; id?: string | null }[] = [];
  try { artists = JSON.parse(row.artistsJson); } catch { /* ignore */ }
  if (!Array.isArray(artists) || artists.length === 0) artists = [{ name: row.artistName, id: null }];
  return {
    videoId: row.videoId,
    title: row.title,
    artists,
    artistName: row.artistName,
    album: row.albumTitle ? { name: row.albumTitle, id: row.albumId } : null,
    albumId: row.albumId || "",
    albumTitle: row.albumTitle || "",
    duration: row.duration,
    duration_seconds: row.durationSeconds,
    thumbnails: [],
    cover: row.cover || (row.videoId ? `https://i.ytimg.com/vi/${row.videoId}/hqdefault.jpg` : ""),
  };
}
