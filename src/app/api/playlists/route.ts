import { db } from "@/lib/db";
import { safe, snapshotToSong, upsertTrack } from "@/lib/api-helpers";
import type { Song } from "@/lib/types";

/** GET /api/playlists — user's local playlists (metadata + counts). */
export async function GET() {
  return safe(async () => {
    const playlists = await db.playlist.findMany({
      orderBy: { updatedAt: "desc" },
      include: { items: { orderBy: { position: "asc" }, take: 4, include: { track: true } } },
    });
    const counts = await db.playlistItem.groupBy({ by: ["playlistId"], _count: true });
    const countOf = (id: string) => counts.find((c) => c.playlistId === id)?._count ?? 0;
    return Response.json(
      playlists.map((p) => ({
        playlistId: p.id,
        id: p.id,
        title: p.name,
        description: p.description || null,
        kind: "local" as const,
        cover: p.items[0]?.track?.cover || "",
        thumbnails: p.items[0]?.track?.cover
          ? [{ url: p.items[0].track.cover, width: 544, height: 544 }]
          : [],
        count: countOf(p.id),
        subtitle: `${countOf(p.id)} songs`,
        author: { name: "You", id: null },
        previewTracks: p.items.map((it) => snapshotToSong(it.track)),
      }))
    );
  });
}

/** POST /api/playlists — create local playlist. Body: { title, description?, videoIds?, tracks? } */
export async function POST(req: Request) {
  return safe(async () => {
    const body = await req.json().catch(() => null);
    const title: string = (body?.title || "").trim();
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    const playlist = await db.playlist.create({
      data: { name: title, description: body?.description || null },
    });
    const videoIds: string[] = Array.isArray(body?.videoIds) ? body.videoIds.slice(0, 500) : [];
    if (videoIds.length > 0) {
      // Snapshot every provided track FIRST — PlaylistItem has an FK into
      // Track, and queue/mix songs often aren't snapshotted yet (a bare
      // createMany used to fail the whole batch with an FK violation,
      // silently producing empty playlists).
      const tracks = Array.isArray(body?.tracks) ? body.tracks : [];
      const byId = new Map<string, Record<string, any>>();
      for (const t of tracks) if (t?.videoId) byId.set(t.videoId, t);
      for (const t of byId.values()) await upsertTrack(t as Partial<Song> & { videoId: string });
      const known = new Set(
        (await db.track.findMany({ where: { videoId: { in: videoIds } }, select: { videoId: true } })).map((r) => r.videoId)
      );
      const placeable = videoIds.filter((v) => known.has(v));
      if (placeable.length > 0) {
        await db.playlistItem.createMany({
          data: placeable.map((videoId, i) => ({
            playlistId: playlist.id, videoId, position: i,
          })),
        });
      }
    }
    return Response.json({ playlistId: playlist.id, status: "created" });
  });
}
