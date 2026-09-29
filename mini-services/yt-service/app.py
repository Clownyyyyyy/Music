"""
yt-service — FastAPI sidecar wrapping ytmusicapi (Unofficial YouTube Music API).

This is the REAL data source for the app: every song, album, artist, playlist,
chart, mood and mix comes live from YouTube Music via ytmusicapi. No demo or
synthesized data anywhere.

Design notes:
- One shared YTMusic() client (public, unauthenticated scope).
- In-memory TTL cache (per-endpoint) to keep the UI snappy and stay polite
  with YouTube Music endpoints.
- Sync handlers run in FastAPI's threadpool (ytmusicapi is blocking requests).
- Authenticated features (private library, likes on YT account, personalized
  mixes like On Repeat / Discover Mix) require a browser-auth header file and
  are intentionally NOT exposed here; the app implements its own local
  equivalents (see /api/mixes in the Next.js layer).
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from ytmusicapi import YTMusic

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("yt-service")

app = FastAPI(title="yt-service", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

_YT: YTMusic | None = None
_YT_LOCK = threading.Lock()
_CACHE: dict[str, tuple[float, Any]] = {}   # key -> (expires_at, value)
_CACHE_LOCK = threading.Lock()
_FLIGHT: dict[str, threading.Event] = {}
_FLIGHT_LOCK = threading.Lock()

DEFAULT_TTL = 300          # 5 min for browse-style payloads
SHORT_TTL = 120            # search / suggestions
LONG_TTL = 1800            # charts, mood categories

# Hard per-call deadlines (seconds) for COLD fetches only. Stale-while-
# revalidate (below) means repeat traffic is served instantly from cache;
# users only ever wait on a first-ever request, and never longer than this.
CALL_TIMEOUT_S: dict[str, float] = {
    "search": 8, "suggestions": 6, "home": 8, "trending": 8,
    "song": 8, "album": 10, "artist": 10, "artist_albums": 10,
    "watch": 10, "playlist": 12, "lyrics": 6,
    "mood_categories": 8, "mood_playlists": 10, "charts": 10,
}
DEFAULT_CALL_TIMEOUT_S = 8.0

# ------------------------------------------------------ disk persistence ---
# Cache survives sidecar restarts: on boot we reload the last known payloads
# so the app serves data instantly even before YouTube answers once.
_DISK_PATH = Path(__file__).resolve().parent / "cache.json"
_DISK_LOCK = threading.Lock()
_DISK_DIRTY = False
_DISK_MAX_ENTRIES = 500
_DISK_FLUSH_INTERVAL = 15  # seconds


def _disk_mark_dirty() -> None:
    global _DISK_DIRTY
    _DISK_DIRTY = True


def _disk_load() -> None:
    try:
        raw = json.loads(_DISK_PATH.read_text())
        loaded = 0
        with _CACHE_LOCK:
            for key, item in raw.items():
                try:
                    expires_at, value = item
                    _CACHE[key] = (float(expires_at), value)
                    loaded += 1
                except Exception:  # noqa: BLE001
                    continue
        log.info("disk cache loaded: %d entries", loaded)
    except FileNotFoundError:
        pass
    except Exception as e:  # noqa: BLE001
        log.warning("disk cache load failed: %s", e)


def _disk_flush() -> None:
    global _DISK_DIRTY
    with _CACHE_LOCK:
        snapshot = dict(_CACHE)
    if len(snapshot) > _DISK_MAX_ENTRIES:
        keep = sorted(snapshot.items(), key=lambda kv: kv[1][0], reverse=True)[:_DISK_MAX_ENTRIES]
        snapshot = dict(keep)
    payload: dict[str, list[Any]] = {}
    for key, (expires_at, value) in snapshot.items():
        try:
            json.dumps(value)
            payload[key] = [expires_at, value]
        except Exception:  # noqa: BLE001
            continue
    tmp = _DISK_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload))
    os.replace(tmp, _DISK_PATH)
    _DISK_DIRTY = False


def _disk_flusher() -> None:
    while True:
        time.sleep(_DISK_FLUSH_INTERVAL)
        try:
            with _DISK_LOCK:
                if _DISK_DIRTY:
                    _disk_flush()
        except Exception as e:  # noqa: BLE001
            log.warning("disk flush failed: %s", e)


def yt() -> YTMusic:
    global _YT
    if _YT is None:
        with _YT_LOCK:
            if _YT is None:
                _YT = YTMusic()
    return _YT


def cache_key(name: str, args: dict[str, Any]) -> str:
    return name + "|" + "|".join(f"{k}={args.get(k)}" for k in sorted(args))


def _refresh_async(key: str, name: str, ttl: int, fn) -> None:
    """Kick a background refetch for a stale key (single-flight guarded)."""
    with _FLIGHT_LOCK:
        if key in _FLIGHT:
            return  # a fetch for this key is already running
        ev = threading.Event()
        _FLIGHT[key] = ev

    def _bg() -> None:
        try:
            value = call_with_timeout(fn, CALL_TIMEOUT_S.get(name, DEFAULT_CALL_TIMEOUT_S))
            with _CACHE_LOCK:
                _CACHE[key] = (time.time() + ttl, value)
            _disk_mark_dirty()
        except Exception as e:  # noqa: BLE001
            log.warning("background refresh %s failed: %s", name, e)
        finally:
            with _FLIGHT_LOCK:
                ev.set()
                _FLIGHT.pop(key, None)

    threading.Thread(target=_bg, daemon=True, name=f"bg-refresh-{name}").start()


def cached(name: str, args: dict[str, Any], ttl: int, fn, refresh: bool = False):
    key = cache_key(name, args)
    now = time.time()
    if not refresh:
        with _CACHE_LOCK:
            hit = _CACHE.get(key)
        if hit:
            if hit[0] > now:
                return hit[1]  # fresh
            # STALE-WHILE-REVALIDATE: return the last good payload NOW and
            # refresh in the background — the user never waits on YouTube.
            _refresh_async(key, name, ttl, fn)
            return hit[1]
    # cold miss (or forced refresh): blocking fetch, single-flight per key.
    # ⚠️ DEADLOCK RULE: NEVER wait on a flight event while holding _FLIGHT_LOCK.
    # The old code did ev.wait() inside the lock while the fetcher needed the
    # same lock in its finally-block to set the event — the first overlapping
    # same-key request froze the ENTIRE sidecar (every sync endpoint queues on
    # this lock). Join flights lock-free, then either lead or retry.
    while True:
        with _FLIGHT_LOCK:
            existing = _FLIGHT.get(key)
        if existing is not None:
            existing.wait()  # NOT holding _FLIGHT_LOCK here
            with _CACHE_LOCK:
                hit = _CACHE.get(key)
            if hit:
                return hit[1]  # fresh or stale — better than failing
            # their fetch failed with nothing cached — try to lead ourselves
        with _FLIGHT_LOCK:
            if key in _FLIGHT:
                continue  # someone else is fetching; join them
            ev = threading.Event()
            _FLIGHT[key] = ev
        break
    try:
        value = call_with_timeout(fn, CALL_TIMEOUT_S.get(name, DEFAULT_CALL_TIMEOUT_S))
        with _CACHE_LOCK:
            _CACHE[key] = (time.time() + ttl, value)
        _disk_mark_dirty()
        return value
    except Exception:
        # serve-stale-on-error: if we ever fetched this successfully, return the
        # stale copy instead of failing (YouTube rate-limits bursts)
        with _CACHE_LOCK:
            hit = _CACHE.get(key)
        if hit:
            log.warning("%s upstream failed — serving stale cache", name)
            return hit[1]
        raise
    finally:
        with _FLIGHT_LOCK:
            ev.set()
            _FLIGHT.pop(key, None)


def call_with_timeout(fn, timeout_s: float):
    """Run blocking fn in a worker thread; raise TimeoutError past the deadline."""
    if timeout_s <= 0:
        return fn()
    result: dict[str, Any] = {}

    def _runner():
        try:
            result["value"] = fn()
        except BaseException as e:  # noqa: BLE001
            result["error"] = e

    t = threading.Thread(target=_runner, daemon=True, name="yt-call")
    t.start()
    t.join(timeout_s)
    if t.is_alive():
        raise TimeoutError(f"upstream call exceeded {timeout_s:.0f}s")
    if "error" in result:
        raise result["error"]
    return result["value"]


def run(name: str, args: dict[str, Any], ttl: int, fn, refresh: bool = False):
    try:
        return cached(name, args, ttl, fn, refresh=refresh)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        log.exception("%s failed: %s", name, e)
        raise HTTPException(status_code=502, detail=f"{name} failed: {type(e).__name__}: {e}") from e


def as_int(v, default: int, lo: int, hi: int) -> int:
    try:
        return max(lo, min(hi, int(v)))
    except (TypeError, ValueError):
        return default


def has_method(name: str) -> bool:
    return hasattr(yt(), name)


# ---------------------------------------------------------------- health ---
@app.get("/health")
def health():
    ok = True
    try:
        yt()
    except Exception:  # noqa: BLE001
        ok = False
    return {"status": "ok" if ok else "degraded", "service": "yt-service", "ts": time.time()}


@app.post("/cache/flush")
def cache_flush():
    with _CACHE_LOCK:
        _CACHE.clear()
    try:
        _DISK_PATH.unlink(missing_ok=True)
    except Exception:  # noqa: BLE001
        pass
    return {"flushed": True, "disk_cleared": True}


# ---------------------------------------------------------------- search ---
@app.get("/search")
def search(
    query: str = Query(..., min_length=1),
    filter: str | None = Query(None, alias="filter"),  # songs/videos/albums/artists/playlists/community_playlists/featured_playlists
    scope: str | None = None,                          # library/uploads (auth only) — pass-through
    limit: int = 20,
    ignore_spelling: bool = False,
):
    limit = as_int(limit, 20, 1, 100)
    kwargs: dict[str, Any] = {"query": query, "limit": limit, "ignore_spelling": ignore_spelling}
    if filter:
        kwargs["filter"] = filter
    if scope:
        kwargs["scope"] = scope
    return run("search", {"query": query, "filter": filter, "limit": limit, "scope": scope}, SHORT_TTL,
               lambda: yt().search(**kwargs))


@app.get("/suggestions")
def suggestions(query: str, detailed: bool = False):
    return run("suggestions", {"query": query, "detailed": detailed}, SHORT_TTL,
               lambda: yt().get_search_suggestions(query, detailed))


# ------------------------------------------------------------------ home ---
@app.get("/home")
def home(limit: int = 4):
    limit = as_int(limit, 4, 1, 10)
    return run("home", {"limit": limit}, DEFAULT_TTL, lambda: yt().get_home(limit=limit))


@app.get("/trending")
def trending():
    if not has_method("get_trending"):
        return {"items": []}
    return run("trending", {}, DEFAULT_TTL, lambda: yt().get_trending())


# ------------------------------------------------------------ detail pages ---
@app.get("/song/{video_id}")
def song(video_id: str):
    """Best-effort song detail. YouTube bot-gates the 'next' endpoint for
    datacenter IPs; when gated we degrade gracefully (the app resolves tracks
    via /watch and search metadata instead)."""
    def _get():
        data = yt().get_song(video_id)
        status = (data.get("playabilityStatus") or {}).get("status")
        if status in ("LOGIN_REQUIRED", "UNPLAYABLE", "ERROR"):
            return {"videoId": video_id, "playabilityStatus": status, "gated": True}
        return data
    return run("song", {"id": video_id}, SHORT_TTL, _get)


@app.get("/album/{browse_id}")
def album(browse_id: str):
    return run("album", {"id": browse_id}, DEFAULT_TTL, lambda: yt().get_album(browse_id))


@app.get("/artist/{browse_id}")
def artist(browse_id: str):
    return run("artist", {"id": browse_id}, DEFAULT_TTL, lambda: yt().get_artist(browse_id))


@app.get("/artist/{browse_id}/albums")
def artist_albums(browse_id: str, params: str, limit: int = 100):
    limit = as_int(limit, 100, 1, 300)
    return run("artist_albums", {"id": browse_id, "params": params, "limit": limit}, DEFAULT_TTL,
               lambda: yt().get_artist_albums(browse_id, params, limit=limit))


# ------------------------------------------------------------- playlists ---
@app.get("/watch")
def watch(
    videoId: str | None = None,
    playlistId: str | None = None,
    radio: bool = False,
    shuffle: bool = False,
    limit: int = 25,
):
    limit = as_int(limit, 25, 1, 100)
    kwargs: dict[str, Any] = {"radio": radio, "shuffle": shuffle, "limit": limit}
    if videoId:
        kwargs["videoId"] = videoId
    if playlistId:
        kwargs["playlistId"] = playlistId
    return run("watch", {"videoId": videoId, "playlistId": playlistId, "radio": radio, "shuffle": shuffle, "limit": limit},
               SHORT_TTL, lambda: yt().get_watch_playlist(**kwargs))


@app.get("/playlist/{playlist_id}")
def playlist(playlist_id: str, limit: int = 100, related: bool = False, suggestions_limit: int = 25):
    limit = as_int(limit, 100, 1, 500)
    sl = as_int(suggestions_limit, 25, 0, 100)
    return run("playlist", {"id": playlist_id, "limit": limit, "related": related, "suggestions_limit": sl},
               DEFAULT_TTL,
               lambda: yt().get_playlist(playlist_id, limit=limit, related=related, suggestions_limit=sl))


# ----------------------------------------------------------------- lyrics ---
@app.get("/lyrics/{video_id}")
def lyrics(video_id: str):
    def _get():
        obj = None
        try:
            obj = yt().get_lyrics(video_id)
        except Exception:  # noqa: BLE001 — many videos simply have no lyrics
            return None
        if obj is None:
            return None
        return {"lyricsId": getattr(obj, "lyricsId", None),
                "hasTimestamps": getattr(obj, "has_timestamps", False),
                "lyrics": getattr(obj, "lyrics", None)}
    return run("lyrics", {"id": video_id}, LONG_TTL, _get)


# ---------------------------------------------------------- moods & charts ---
@app.get("/moods/categories")
def moods_categories():
    return run("moods_categories", {}, LONG_TTL, lambda: yt().get_mood_categories())


@app.get("/moods/playlists")
def moods_playlists(params: str, limit: int = 100):
    limit = as_int(limit, 100, 1, 200)
    return run("moods_playlists", {"params": params, "limit": limit}, DEFAULT_TTL,
               lambda: yt().get_mood_playlists(params)[:limit])


@app.get("/charts")
def charts(country: str = "ZZ", refresh: bool = False):
    # charts payload is heavy on YouTube's side and the browse endpoint is
    # frequently rate-limited from datacenter IPs — cache aggressively
    return run("charts", {"country": country}, 1800,
               lambda: yt().get_charts(country=country), refresh=refresh)


# ------------------------------------------------------------- warmup ---
@app.on_event("startup")
def warmup() -> None:
    """Boot fast: reload the persisted cache, start the disk flusher, then
    prefetch the core browse payloads (instant if disk cache is still fresh).
    Jobs reuse the real endpoint cache keys — the old implementation wrote
    charts under a key the /charts route never read, so that warmup was dead
    weight."""
    _disk_load()
    threading.Thread(target=_disk_flusher, daemon=True, name="disk-flusher").start()

    def _warm():
        jobs = [
            ("home", {"limit": 4}, DEFAULT_TTL, lambda: yt().get_home(limit=4)),
            ("mood_categories", {}, LONG_TTL, lambda: yt().get_mood_categories()),
            ("charts", {"country": "ZZ"}, 1800, lambda: yt().get_charts(country="ZZ")),
        ]
        for name, args, ttl, fn in jobs:
            try:
                cached(name, args, ttl, fn)
                log.info("warmup ok: %s", name)
            except Exception as e:  # noqa: BLE001
                log.warning("warmup failed: %s — %s", name, e)
    threading.Thread(target=_warm, daemon=True).start()
