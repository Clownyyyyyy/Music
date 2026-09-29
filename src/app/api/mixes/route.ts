import { db } from "@/lib/db";
import { ytService } from "@/lib/yt-service";
import { normSongList } from "@/lib/normalize";
import { snapshotToSong, safe } from "@/lib/api-helpers";
import type { Mix, MixId, Song } from "@/lib/types";

/**
 * GET /api/mixes          — all four smart mixes (spec: smart/auto-generated playlists)
 * GET /api/mixes?id=...   — a single mix
 *
 * Documented assumption: YouTube's own "On Repeat" / "Discover Mix" are
 * account-personalized and require authenticated ytmusicapi (a browser login
 * header file this deployment does not have). The equivalents below are
 * built from REAL data available unauthenticated:
 *   - on-repeat  : the user's most-played local stats
 *   - discover   : YouTube radio expansion of liked + recent seeds
 *   - my-mix     : a real YouTube mood playlist matched to local taste
 *   - fresh-finds: real chart songs + home "New releases" the user hasn't heard
 */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") as MixId | null;
    const limit = Math.min(50, Math.max(5, Number(url.searchParams.get("limit")) || 25));
    if (id) return Response.json(await buildMix(id, limit));
    const mixes = await Promise.all(
      (["on-repeat", "discover", "my-mix", "fresh-finds"] as MixId[]).map((m) => buildMix(m, limit))
    );
    return Response.json(mixes.filter((m) => m.tracks.length > 0));
  });
}

async function buildMix(id: MixId, limit: number): Promise<Mix> {
  switch (id) {
    case "on-repeat": {
      const stats = await db.playStat.findMany({
        orderBy: [{ playCount: "desc" }, { completions: "desc" }],
        take: limit,
        include: { track: true },
      });
      const tracks = stats
        .filter((s) => s.playCount > 0)
        .map((s) => ({ ...snapshotToSong(s.track), reason: `${s.playCount} plays` }));
      return {
        id: "on-repeat",
        title: "On Repeat",
        description: "The songs you can't stop playing",
        tracks,
      };
    }
    case "discover": {
      const [liked, recent] = await Promise.all([
        db.likedTrack.findMany({ orderBy: { addedAt: "desc" }, take: 3 }),
        db.historyEntry.findMany({ orderBy: { playedAt: "desc" }, take: 3, distinct: ["videoId"] }),
      ]);
      const seen = new Set<string>([
        ...liked.map((l) => l.videoId),
        ...recent.map((r) => r.videoId),
      ]);
      const seeds = [...new Set([...liked.map((l) => l.videoId), ...recent.map((r) => r.videoId)])].slice(0, 3);
      if (seeds.length === 0) {
        const charts = await ytService.charts("ZZ");
        const chartSongs = normSongList((charts.videos || []).slice(0, limit));
        return { id: "discover", title: "Discover Mix", description: "Fresh music picked for you", tracks: chartSongs };
      }
      const radios = await Promise.all(
        seeds.map((s) =>
          ytService.watch({ videoId: s, radio: true, limit: 25 }).then((d) => normSongList(d.tracks)).catch(() => [] as Song[])
        )
      );
      const merged: Song[] = [];
      const push = (s: Song) => {
        if (!seen.has(s.videoId) && !merged.some((m) => m.videoId === s.videoId)) {
          merged.push({ ...s, reason: "New discovery from your listening" });
        }
      };
      // round-robin merge for variety
      for (let i = 0; merged.length < limit && i < 30; i++) {
        for (const list of radios) if (list[i]) push(list[i]);
      }
      return { id: "discover", title: "Discover Mix", description: "Fresh music picked for you", tracks: merged.slice(0, limit) };
    }
    case "my-mix": {
      // pick a real YT mood playlist based on local taste hour + variety
      const cats = await ytService.moodCategories();
      const moodCats = cats["Moods & moments"] || [];
      if (moodCats.length === 0) return { id: "my-mix", title: "My Mix", description: "A mix made for you", tracks: [] };
      const h = new Date().getHours();
      const cat = moodCats[(h + new Date().getDate()) % moodCats.length];
      const playlists = await ytService.moodPlaylists(cat.params, 10);
      const pick = playlists[new Date().getDate() % Math.max(playlists.length, 1)];
      if (!pick?.playlistId) return { id: "my-mix", title: "My Mix", description: "A mix made for you", tracks: [] };
      const pl = await ytService.playlist(pick.playlistId, limit).catch(() => null);
      const tracks = normSongList(pl?.tracks || []).map((s) => ({
        ...s,
        reason: `From YouTube Music's ${pick.title}`,
      }));
      return { id: "my-mix", title: "My Mix 1", description: `${cat.title} · ${pick.title}`, tracks };
    }
    case "fresh-finds": {
      const [charts, home] = await Promise.all([
        ytService.charts("ZZ").catch(() => null),
        ytService.home(3).catch(() => null),
      ]);
      const seen = new Set<string>([
        ...(await db.historyEntry.findMany({ take: 100, distinct: ["videoId"], select: { videoId: true } })).map((r) => r.videoId),
      ]);
      const fromCharts = normSongList(charts?.videos || []);
      const newReleases = normSongList(
        (home || []).find((s: Record<string, any>) => /new releases/i.test(s?.title || ""))?.contents || []
      );
      const merged: Song[] = [];
      for (const s of [...newReleases, ...fromCharts]) {
        if (!seen.has(s.videoId) && !merged.some((m) => m.videoId === s.videoId)) {
          merged.push({ ...s, reason: "Recent and trending" });
        }
        if (merged.length >= limit) break;
      }
      return { id: "fresh-finds", title: "Fresh Finds", description: "New releases and rising tracks", tracks: merged };
    }
  }
}
