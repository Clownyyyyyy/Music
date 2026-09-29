import { db } from "@/lib/db";
import { snapshotToSong, upsertTrack, apiError, safe } from "@/lib/api-helpers";

/** GET /api/history — listening history grouped by day (local). */
export async function GET() {
  return safe(async () => {
    const rows = await db.historyEntry.findMany({
      orderBy: { playedAt: "desc" },
      take: 500,
      include: { track: true },
    });
    const byDay = new Map<string, typeof rows>();
    for (const row of rows) {
      const day = new Date(row.playedAt).toISOString().slice(0, 10);
      const list = byDay.get(day) || [];
      list.push(row);
      byDay.set(day, list);
    }
    const days = [...byDay.entries()].map(([date, entries]) => ({
      date,
      entries: entries.map((e) => ({
        ...snapshotToSong(e.track),
        id: e.id,
        played: new Date(e.playedAt).toISOString(),
        percentPlayed: e.percentPlayed,
        context: e.context,
      })),
    }));
    return Response.json(days);
  });
}

/** POST /api/history — record one play. Body: { track, percentPlayed, context } */
export async function POST(req: Request) {
  return safe(async () => {
    const body = await req.json().catch(() => null);
    const track = body?.track;
    if (!track?.videoId) return apiError("missing track.videoId", 400);
    await upsertTrack(track);
    if (body.saveHistory !== false) {
      await db.historyEntry.create({
        data: {
          videoId: track.videoId,
          percentPlayed: Number(body.percentPlayed) || 0,
          context: body.context || "manual",
        },
      });
    }
    return Response.json({ status: "ok" });
  });
}

/** DELETE /api/history?ids=a,b | ?all=true */
export async function DELETE(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    if (url.searchParams.get("all") === "true") {
      await db.historyEntry.deleteMany({});
      return Response.json({ status: "cleared" });
    }
    const ids = (url.searchParams.get("ids") || "").split(",").filter(Boolean);
    if (ids.length === 0) return apiError("ids or all required", 400);
    await db.historyEntry.deleteMany({ where: { id: { in: ids } } });
    return Response.json({ status: "removed", count: ids.length });
  });
}
