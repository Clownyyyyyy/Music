import { db } from "@/lib/db";
import { upsertTrack, apiError, safe } from "@/lib/api-helpers";

/**
 * POST   /api/playlists/[id]/items  { videoIds: string[], tracks?: Song[] } — add
 * DELETE /api/playlists/[id]/items  { itemIds: string[] }            — remove
 * PATCH  /api/playlists/[id]/items  { order: string[] (itemIds) }    — reorder
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const videoIds: string[] = Array.isArray(body?.videoIds) ? body.videoIds : [];
    if (videoIds.length === 0) return apiError("videoIds required", 400);
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];
    for (const t of tracks) if (t?.videoId) await upsertTrack(t);

    const playlist = await db.playlist.findUnique({ where: { id } });
    if (!playlist) return apiError("playlist not found", 404);
    const last = await db.playlistItem.aggregate({
      where: { playlistId: id },
      _max: { position: true },
    });
    const start = (last._max.position ?? -1) + 1;
    const existing = new Set(
      (await db.playlistItem.findMany({ where: { playlistId: id }, select: { videoId: true } }))
        .map((i) => i.videoId)
    );
    const fresh = videoIds.filter((v) => !existing.has(v));
    await db.playlistItem.createMany({
      data: fresh.map((videoId, i) => ({ playlistId: id, videoId, position: start + i })),
    });
    await db.playlist.update({ where: { id }, data: { updatedAt: new Date() } });
    return Response.json({ status: "added", count: fresh.length });
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const itemIds: string[] = Array.isArray(body?.itemIds) ? body.itemIds : [];
    if (itemIds.length === 0) return apiError("itemIds required", 400);
    await db.playlistItem.deleteMany({ where: { playlistId: id, id: { in: itemIds } } });
    await renumber(id);
    return Response.json({ status: "removed" });
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    const order: string[] = Array.isArray(body?.order) ? body.order : [];
    if (order.length === 0) return apiError("order required", 400);
    const items = await db.playlistItem.findMany({ where: { playlistId: id } });
    const positionOf = new Map(items.map((i) => [i.id, i.position]));
    let pos = 0;
    for (const itemId of order) {
      if (positionOf.has(itemId)) {
        await db.playlistItem.update({ where: { id: itemId }, data: { position: pos++ } });
      }
    }
    await db.playlist.update({ where: { id }, data: { updatedAt: new Date() } });
    return Response.json({ status: "reordered" });
  });
}

async function renumber(playlistId: string) {
  const items = await db.playlistItem.findMany({
    where: { playlistId },
    orderBy: { position: "asc" },
  });
  let pos = 0;
  for (const item of items) {
    if (item.position !== pos) {
      await db.playlistItem.update({ where: { id: item.id }, data: { position: pos } });
    }
    pos++;
  }
}
