# B&W Music — Real YouTube Music Client

A production-ready music streaming app powered by **live YouTube Music data** via `ytmusicapi`. Every song, album, artist, playlist, chart and mood row is fetched in real time — no demo data.

## Stack

- **Frontend + API**: Next.js 16 (App Router, TypeScript, Tailwind, shadcn/ui, TanStack Query, Zustand)
- **Data service**: Python FastAPI sidecar (`mini-services/yt-service`) wrapping [ytmusicapi](https://github.com/sigma67/ytmusicapi)
- **Playback**: real audio/video streamed in the browser through the YouTube IFrame Player
- **Local user data** (likes, playlists, history, feedback loop): SQLite + Prisma
- **PWA**: installable, offline shell, media-safe caching

## Architecture

```
Browser ──► Next.js (UI + /api routes)
                 │  node:http
                 ▼
        FastAPI sidecar (:3031, ytmusicapi) ──► YouTube Music
                 │
        SQLite (Prisma) — likes / playlists / history
```

## Run locally

```bash
bun install                     # or npm install
pip install fastapi uvicorn ytmusicapi
npx prisma db push
bun run build && bun run start  # production
# dev: bun run dev
```

The Next.js server auto-starts and self-heals the Python sidecar on demand.

## Deploy

See the deployment notes: two processes (Next.js + Python sidecar) and one SQLite database (attach a persistent volume on Railway / a VPS path with a reverse proxy).
