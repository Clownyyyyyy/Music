import { db } from "@/lib/db";
import { snapshotToSong, safe } from "@/lib/api-helpers";

/** GET /api/playlists/[id] — local playlist detail with full track list. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const playlist = await db.playlist.findUnique({
      where: { id },
      include: { items: { orderBy: { position: "asc" }, include: { track: true } } },
    });
    if (!playlist) return Response.json({ error: "not found" }, { status: 404 });
    const tracks = playlist.items.map((it) => ({
      ...snapshotToSong(it.track),
      itemId: it.id,
      likeStatus: undefined,
    }));
    return Response.json({
      playlistId: playlist.id,
      id: playlist.id,
      title: playlist.name,
      description: playlist.description || null,
      kind: "local" as const,
      author: { name: "You", id: null },
      year: new Date(playlist.createdAt).getFullYear().toString(),
      trackCount: tracks.length,
      duration_seconds: tracks.reduce((a, t) => a + (t.duration_seconds || 0), 0),
      cover: tracks[0]?.cover || "",
      thumbnails: tracks.slice(0, 4).map((t) => ({ url: t.cover, width: 544, height: 544 })),
      tracks,
    });
  });
}

/** PATCH /api/playlists/[id] — rename / re-describe. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const data: { name?: string; description?: string | null } = {};
    if (typeof body?.title === "string" && body.title.trim()) data.name = body.title.trim();
    if (typeof body?.description === "string") data.description = body.description;
    if (Object.keys(data).length === 0) return Response.json({ status: "noop" });
    await db.playlist.update({ where: { id }, data });
    return Response.json({ status: "updated" });
  });
}

/** DELETE /api/playlists/[id] */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    await db.playlist.delete({ where: { id } }).catch(() => {});
    return Response.json({ status: "deleted" });
  });
}
