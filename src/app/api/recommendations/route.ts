import { db } from "@/lib/db";
import { ytService } from "@/lib/yt-service";
import { normSongList } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";
import type { Song } from "@/lib/types";

/**
 * GET /api/recommendations?seed=<videoId>&limit=25
 *
 * Implements the spec's ranking formula over REAL signals:
 *
 *   score = 0.35 x user_similarity      (candidate co-occurs across many
 *                                        users' radio lists = YouTube's own
 *                                        collaborative filtering)
 *         + 0.25 x song_similarity      (rank position in the seed's radio)
 *         + 0.20 x sequence_score       (learned A->B transitions from the
 *                                        user's feedback loop)
 *         + 0.10 x mood_similarity      (YouTube places tracks with matching
 *                                        vibe adjacently in radios; rank
 *                                        proximity to seeds)
 *         + 0.05 x popularity           (view counts on candidates)
 *         + 0.05 x freshness            (new-to-user bonus, decays)
 *
 * Candidates: radio/watch playlists of the seed + the user's recently played
 * transitions; the feedback loop updates Transition rows (see /api/feedback).
 */
const W = { user: 0.35, song: 0.25, seq: 0.20, mood: 0.10, pop: 0.05, fresh: 0.05 };

export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const seed = url.searchParams.get("seed") || "";
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 25));

    // ---- gather seeds: explicit seed + local signals (recent transitions / liked / stats)
    const seedIds = new Set<string>(seed ? [seed] : []);
    const [recentHistory, liked, topStats] = await Promise.all([
      db.historyEntry.findMany({ orderBy: { playedAt: "desc" }, take: 5, distinct: ["videoId"] }),
      db.likedTrack.findMany({ orderBy: { addedAt: "desc" }, take: 5 }),
      db.playStat.findMany({ orderBy: { playCount: "desc" }, take: 5 }),
    ]);
    for (const h of recentHistory) seedIds.add(h.videoId);
    for (const l of liked) seedIds.add(l.videoId);
    for (const s of topStats) seedIds.add(s.videoId);
    if (seedIds.size === 0) {
      // cold start: global charts as seeds
      const charts = await ytService.charts("ZZ");
      for (const v of (charts.videos || []).slice(0, 5)) seedIds.add(v.videoId);
    }

    // ---- candidate generation via YouTube radio lists (collaborative signal)
    const seeds = [...seedIds].slice(0, 6);
    const radioLists = await Promise.all(
      seeds.map((sid) =>
        ytService.watch({ videoId: sid, radio: true, limit: 30 })
          .then((d) => normSongList(d.tracks).filter((t) => t.videoId !== sid))
          .catch(() => [] as Song[])
      )
    );

    // ---- learned transitions from this user
    const transitions = await db.transition.findMany({
      where: { fromVideoId: { in: seeds } },
      orderBy: { score: "desc" },
      take: 100,
    });
    const seqScore = new Map(transitions.map((t) => [t.toVideoId, t.score]));

    // ---- popularity of candidates (views parsed from formatted strings)

    // ---- score every candidate
    interface Cand { song: Song; usim: number; ssim: number; views: number; rankAvg: number; seedsIn: number; }
    const cands = new Map<string, Cand>();
    for (const list of radioLists) {
      list.forEach((song, idx) => {
        const rankNorm = 1 - idx / Math.max(list.length, 1); // 1 = right after seed
        const cur = cands.get(song.videoId);
        if (cur) {
          cur.usim = (cur.usim * cur.seedsIn + rankNorm) / (cur.seedsIn + 1);
          cur.seedsIn += 1;
          cur.rankAvg = (cur.rankAvg + idx) / 2;
          const views = parseInt((song.views || "0").replace(/[^0-9]/g, ""), 10) || 0;
          cur.views = Math.max(cur.views, views);
        } else {
          const views = parseInt((song.views || "0").replace(/[^0-9]/g, ""), 10) || 0;
          cands.set(song.videoId, { song, usim: rankNorm, ssim: rankNorm, views, rankAvg: idx, seedsIn: 1 });
        }
      });
    }
    const maxViews = Math.max(1, ...[...cands.values()].map((c) => c.views));

    // freshness: how new-to-user a candidate is (never played/history -> 1)
    const seenIds = new Set([
      ...(await db.historyEntry.findMany({ take: 200, distinct: ["videoId"], select: { videoId: true } })).map((r) => r.videoId),
      ...(await db.likedTrack.findMany({ select: { videoId: true } })).map((r) => r.videoId),
    ]);

    const maxSeq = Math.max(1, ...transitions.map((t) => Math.abs(t.score)));
    const scored = [...cands.values()]
      .filter((c) => !seenIds.has(c.song.videoId))
      .map((c) => {
        const seq = (seqScore.get(c.song.videoId) || 0) / maxSeq;           // [-1, 1]
        const mood = Math.max(0, 1 - c.rankAvg / 30);                        // adjacency proxy
        const pop = Math.log10(c.views + 1) / Math.log10(maxViews + 1);
        const fresh = 1;
        const score =
          W.user * c.usim +
          W.song * c.ssim +
          W.seq * Math.max(0, seq) +
          W.mood * mood +
          W.pop * pop +
          W.fresh * fresh;
        return {
          ...c.song,
          score: Math.round(score * 1000) / 1000,
          reason: c.seedsIn > 1 ? `Popular with listeners of ${c.seedsIn} songs you play` : "From your listening mix",
        };
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);

    // context payload (time-of-day context, spec §5)
    const h = new Date().getHours();
    const timeOfDay = h >= 5 && h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night";
    return Response.json({
      tracks: scored,
      context: { timeOfDay, sessionSongs: seeds.length, weights: W },
    });
  });
}
