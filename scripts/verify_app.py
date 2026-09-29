#!/usr/bin/env python3
"""
verify_app.py — end-to-end verification of the B&W Music app (real ytmusicapi data).

Checks, per run:
  1. Next.js API routes return 200 + real-looking payloads within latency budgets.
  2. Real-data invariants: songs have videoIds, thumbnails, artists; charts have
     entries; moods have categories; home has rows; mixes come from real signals.
  3. Hydration-critical: the SSR HTML contains NO time-dependent greeting and
     every API error is JSON (fast-fail), not a hang.

Exit code 0 = all green. Run repeatedly until green.
"""
import json
import re
import sys
import time
import urllib.request
import urllib.error

NEXT = "http://127.0.0.1:3000"
FAILURES: list[str] = []
PASSES = 0


def get(path: str, timeout: float = 40.0):
    """GET a Next API route; return (status, parsed_json_or_text, elapsed_s)."""
    t0 = time.time()
    try:
        with urllib.request.urlopen(NEXT + path, timeout=timeout) as r:
            body = r.read().decode("utf-8", "replace")
            status = r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        status = e.code
    except Exception as e:  # noqa: BLE001
        return 0, f"{type(e).__name__}: {e}", time.time() - t0
    try:
        parsed = json.loads(body)
    except Exception:  # noqa: BLE001
        parsed = body
    return status, parsed, time.time() - t0


def check(name: str, cond: bool, detail: str = ""):
    global PASSES
    mark = "PASS" if cond else "FAIL"
    if cond:
        PASSES += 1
    else:
        FAILURES.append(f"{name} {detail}".strip())
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))


def is_song(s) -> bool:
    return (
        isinstance(s, dict)
        and isinstance(s.get("videoId"), str)
        and re.fullmatch(r"[A-Za-z0-9_-]{6,20}", s.get("videoId", ""))
        and isinstance(s.get("title"), str)
        and bool(s.get("title"))
    )


def main() -> int:
    print("== 1. Home feed (triggers sidecar self-heal if down) ==")
    st, home, el = get("/api/home")
    check("GET /api/home -> 200", st == 200, f"status={st} body={str(home)[:200]}")
    check("home latency < 30s (cold compile ok)", el < 30, f"{el:.1f}s")
    rows = home if isinstance(home, list) else []
    check("home has rows", len(rows) >= 1, f"rows={len(rows)}")
    songs = [c for r in rows for c in r.get("contents", []) if is_song(c)]
    check("home contains real songs with videoIds", len(songs) >= 3, f"songs={len(songs)}")
    covers = [s.get("cover") for s in songs if s.get("cover")]
    check("songs have https cover art", all(str(c).startswith("https://") for c in covers) and covers, f"covers={covers[:2]}")

    print("== 2. Search (all real filters) ==")
    st, res, el = get("/api/search?q=blinding%20lights&filter=songs&limit=10")
    check("search songs -> 200", st == 200, f"status={st}")
    # Flat SearchResponse shape: top/songs/videos/albums/artists/playlists
    songs_res = res.get("songs", []) if isinstance(res, dict) else []
    check("search returns >=5 real songs", sum(1 for s in songs_res if is_song(s)) >= 5, f"n={len(songs_res)}")
    top = next((s for s in songs_res if is_song(s)), None)
    check("top result is The Weeknd", top and "weeknd" in json.dumps(top).lower(), str(top)[:120])
    check("search latency < 12s (cached after)", el < 12, f"{el:.1f}s")

    st, vids, el = get("/api/search?q=blinding%20lights&filter=videos&limit=5")
    vres = vids.get("videos", []) if isinstance(vids, dict) else []
    check("search videos -> 200 with results", st == 200 and len(vres) >= 2, f"{st} n={len(vres)}")

    print("== 3. Suggestions ==")
    st, sug, el = get("/api/suggestions?q=blinding")
    check("suggestions -> 200", st == 200, f"status={st} {str(sug)[:120]}")
    check("suggestions >= 3 strings", isinstance(sug, list) and len(sug) >= 3 and all(isinstance(x, str) for x in sug), str(sug)[:120])

    print("== 4. Charts ==")
    st, charts, el = get("/api/charts", timeout=45)
    check("charts -> 200", st == 200, f"status={st} {str(charts)[:120]}")
    if isinstance(charts, dict):
        check("charts has >=20 country options", len(charts.get("countries", {}).get("options", [])) >= 20,
              f"n={len(charts.get('countries', {}).get('options', []))}")
        check("charts has >=5 ranked songs (fallback resolved)", len(charts.get("songs", [])) >= 5,
              f"n={len(charts.get('songs', []))}")
        check("charts has >=5 artists", len(charts.get("artists", [])) >= 5, f"n={len(charts.get('artists', []))}")

    print("== 5. Moods & genres ==")
    st, cats, el = get("/api/moods/categories")
    check("mood categories -> 200", st == 200, f"status={st}")
    if isinstance(cats, dict):
        check("mood categories non-empty", len(cats) >= 1 and any(len(v or []) > 0 for v in cats.values()), str(cats)[:120])

    print("== 6. Smart mixes (real local signals) ==")
    st, mixes, el = get("/api/mixes")
    check("mixes -> 200", st == 200, f"status={st} {str(mixes)[:150]}")
    if isinstance(mixes, list):
        check("mixes >= 3 (on-repeat/discover/...)", len(mixes) >= 3, f"n={len(mixes)}")

    print("== 7. Song detail + watch radio (playback chain) ==")
    if songs:
        vid = songs[0]["videoId"]
        st, song, el = get(f"/api/songs/{vid}", timeout=35)
        check(f"song detail {vid} -> 200", st == 200, f"status={st} {str(song)[:120]}")
        st, watch, el = get(f"/api/watch?videoId={vid}&radio=true&limit=10", timeout=35)
        check("watch radio -> 200 with tracks", st == 200 and isinstance(watch, dict) and len(watch.get("tracks", []) or []) >= 3, f"status={st} keys={list(watch)[:5] if isinstance(watch, dict) else type(watch)}")

    print("== 8. Local user data ==")
    st, prof, el = get("/api/profile")
    check("profile -> 200", st == 200, f"status={st}")
    st, pls, el = get("/api/playlists")
    check("playlists -> 200", st == 200, f"status={st}")

    print("== 9. SSR HTML hydration-safety ==")
    st, html, el = get("/", timeout=60)
    check("GET / -> 200", st == 200, f"status={st}")
    if isinstance(html, str):
        check("SSR HTML contains NO baked greeting", "Good morning" not in html and "Good afternoon" not in html and "Good evening" not in html and "Good night" not in html)

    print("== 10. Sidecar direct health ==")
    t0 = time.time()
    try:
        with urllib.request.urlopen("http://127.0.0.1:3031/health", timeout=5) as r:
            h = json.load(r)
        check("sidecar /health ok", h.get("status") == "ok", str(h))
    except Exception as e:  # noqa: BLE001
        check("sidecar /health ok", False, f"{type(e).__name__}: {e}")

    print(f"\n{'=' * 60}")
    print(f"RESULT: {PASSES} passed, {len(FAILURES)} failed")
    for f in FAILURES:
        print(f"  ✗ {f}")
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
