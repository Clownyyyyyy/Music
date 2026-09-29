/*
 * Service Worker — PWA support (spec: 📱 PWA architecture).
 *
 * ⚠️ Preview-critical design rule: the HTML shell is NEVER served
 * cache-first. The old implementation precached "/" and answered
 * navigations from that install-time copy, so browsers kept booting a
 * dead shell that referenced long-gone dev chunk URLs -> blank preview
 * that no amount of app-side fixing could heal (fresh revalidates were
 * written to a different cache that never won the lookup).
 *
 * Strategy (all matches scoped to ONE runtime cache):
 *  - navigations (HTML): network-first w/ 4s timeout -> cache -> offline page
 *  - /_next/* dev chunks: network-first w/ 3s timeout -> cache
 *  - /api/*: network-first -> cache (keeps last real data visible offline)
 *  - icons/manifest: stale-while-revalidate (never HTML, safe to cache)
 *
 * Note: music streams come from YouTube's servers (cross-origin iframes),
 * so the SW intentionally does NOT cache media. App data (likes, playlists,
 * history, settings) is stored locally in SQLite/IndexedDB.
 */
const VERSION = "bw-music-yt-v3";
const RUNTIME_CACHE = `${VERSION}-runtime`;

const PRECACHE_ASSETS = [
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/favicon-32.png",
];

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("sw:timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function networkFirst(request, timeoutMs, { cacheOnOk = true } = {}) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await withTimeout(fetch(request), timeoutMs);
    if (cacheOnOk && res && res.ok) await cache.put(request, res.clone());
    return res;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

const OFFLINE_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>B&amp;W Music — offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#fafafa;font-family:system-ui,sans-serif}main{text-align:center;padding:2rem}h1{font-size:1.25rem;letter-spacing:.02em}p{opacity:.7;margin:.5rem 0 1.5rem}button{background:#fafafa;color:#0a0a0a;border:0;border-radius:999px;padding:.6rem 1.4rem;font-weight:600;cursor:pointer}</style></head><body><main><h1>You&rsquo;re offline</h1><p>B&amp;W Music needs a connection to stream YouTube Music.</p><button onclick="location.reload()">Retry</button></main></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(RUNTIME_CACHE)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: ALWAYS network-first (preview reliability rule).
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, 4000).catch(async () => {
        const cached = await caches.open(RUNTIME_CACHE).then((c) => c.match("/"));
        return (
          cached ||
          new Response(OFFLINE_PAGE, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
        );
      })
    );
    return;
  }

  // Next.js chunks: network-first so a stale chunk can never shadow code
  // (URLs are content-hashed, so caching them is safe for offline replay).
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      networkFirst(request, 3000).catch(() => new Response("", { status: 504 }))
    );
    return;
  }

  // API: network-first, cache fallback (keeps last real data visible offline)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      networkFirst(request, 8000).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          })
      )
    );
    return;
  }

  // icons / manifest: stale-while-revalidate, scoped to the runtime cache
  event.respondWith(
    (async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(request);
      const fetchPromise = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })()
  );
});
