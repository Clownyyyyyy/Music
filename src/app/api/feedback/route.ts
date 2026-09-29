import { db } from "@/lib/db";
import { upsertTrack, apiError, safe } from "@/lib/api-helpers";

/**
 * POST /api/feedback — the recommendation feedback loop (spec):
 * play completion % -> PlayStat, skip/complete signal -> Transition score,
 * and (optionally) a history entry. Body:
 * { videoId, track?, percentPlayed, skipped, prevSongId?, context?, saveHistory? }
 */
const LIKE_THRESHOLD = 0.6;   // >=60% played -> positive signal
const DISLIKE_THRESHOLD = 0.2; // <20% played -> negative signal
const STEP = 0.2;              // score step per observation

export async function POST(req: Request) {
  return safe(async () => {
    const body = await req.json().catch(() => null);
    const videoId: string | undefined = body?.videoId;
    if (!videoId) return apiError("missing videoId", 400);
    const percent = Math.max(0, Math.min(1, Number(body?.percentPlayed) || 0));
    const skipped = !!body?.skipped;
    const track = body?.track;
    if (track?.videoId) await upsertTrack(track);

    // ---- play stat (On Repeat source) ----
    const isCompletion = percent >= LIKE_THRESHOLD && !skipped;
    const stat = await db.playStat.upsert({
      where: { videoId },
      create: { videoId },
      update: {},
    });
    await db.playStat.update({
      where: { videoId },
      data: {
        playCount: stat.playCount + 1,
        completions: stat.completions + (isCompletion ? 1 : 0),
        skipCount: stat.skipCount + (skipped ? 1 : 0),
        totalSeconds: stat.totalSeconds + Math.round(percent * 240),
        lastPlayedAt: new Date(),
      },
    });

    // ---- transition A -> B (sequence learning) ----
    const prevSongId: string | undefined = body?.prevSongId;
    if (prevSongId && prevSongId !== videoId) {
      const existing = await db.transition.findUnique({
        where: { fromVideoId_toVideoId: { fromVideoId: prevSongId, toVideoId: videoId } },
      });
      const delta = percent >= LIKE_THRESHOLD && !skipped ? +STEP
        : (skipped && percent < DISLIKE_THRESHOLD) ? -STEP
        : percent >= 0.4 ? +STEP / 2 : 0;
      if (existing) {
        await db.transition.update({
          where: { id: existing.id },
          data: {
            score: Math.max(-1, Math.min(1, existing.score + delta)),
            observations: existing.observations + 1,
          },
        });
      } else {
        await db.transition.create({
          data: { fromVideoId: prevSongId, toVideoId: videoId, score: delta, observations: 1 },
        });
      }
    }

    // ---- history ----
    if (body?.saveHistory !== false && percent >= 0.05) {
      await db.historyEntry.create({
        data: { videoId, percentPlayed: percent, context: body?.context || "manual" },
      });
    }
    return Response.json({ status: "ok" });
  });
}
