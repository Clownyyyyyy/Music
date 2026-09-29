"use client";
/**
 * Hash-based SPA router.
 * The app lives on the single `/` route; internal navigation uses
 * location.hash (#/album/xyz). This keeps the persistent AudioEngine
 * playing seamlessly across "pages" — no route change ever remounts it.
 *
 * Implemented with useSyncExternalStore so SSR renders the server snapshot
 * (empty route) and reconciles after hydration without mismatches.
 */
import { useCallback, useSyncExternalStore } from "react";

export interface Route {
  path: string;          // e.g. "album/abc"
  segments: string[];    // ["album", "abc"]
  query: URLSearchParams;
  raw: string;
}

const EMPTY_ROUTE: Route = { path: "", segments: [], query: new URLSearchParams(), raw: "" };

// cache parsed routes so getSnapshot returns a stable reference between renders
let lastRaw: string | null = null;
let lastRoute: Route = EMPTY_ROUTE;

function parseHash(): Route {
  const hash = window.location.hash.replace(/^#/, "");
  if (hash === lastRaw) return lastRoute;
  const [pathPart, queryPart] = hash.split("?");
  const path = pathPart.replace(/^\/+/, "").replace(/\/+$/, "");
  lastRoute = {
    path,
    segments: path ? path.split("/") : [],
    query: new URLSearchParams(queryPart || ""),
    raw: hash,
  };
  lastRaw = hash;
  return lastRoute;
}

function subscribe(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}

function getClientRoute(): Route {
  return parseHash();
}

function getServerRoute(): Route {
  return EMPTY_ROUTE;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, getClientRoute, getServerRoute);
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const target = to.startsWith("#") ? to : `#${to.startsWith("/") ? to : `/${to}`}`;
  if (window.location.hash === target) return;
  if (opts.replace) {
    window.history.replaceState(null, "", target);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  } else {
    window.location.hash = target;
  }
}

export function useNavigate() {
  return useCallback((to: string, opts?: { replace?: boolean }) => navigate(to, opts), []);
}

export function goBack() {
  window.history.back();
}
