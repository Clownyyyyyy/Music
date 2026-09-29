import { ytService } from "@/lib/yt-service";
import { normPlaylistDetail, normSongList } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/**
 * GET /api/yt-playlists/[id] — a REAL public YouTube Music playlist
 * (RDCLAK5uy_..., RDAMVM..., PL...), with related playlists.
 * Falls back to the watch endpoint when YouTube rate-limits the
 * playlist browse call (tracks still resolve and play).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
    const related = url.searchParams.get("related") === "true";

    try {
      const data = await ytService.playlist(id, limit, related, 14_000);
      const detail = normPlaylistDetail(data);
      if (detail) return Response.json(detail);
    } catch {
      /* fall through to watch-based resolution */
    }

    const watch = await ytService.watch({ playlistId: id, limit: Math.min(limit, 100) });
    const tracks = normSongList(watch.tracks);
    if (tracks.length === 0) return Response.json({ error: "playlist not found" }, { status: 404 });
    return Response.json({
      playlistId: id,
      id,
      title: "YouTube Music playlist",
      description: null,
      thumbnails: tracks[0].thumbnails,
      cover: tracks[0].cover,
      count: tracks.length,
      subtitle: null,
      kind: "yt",
      author: { name: "YouTube Music", id: null },
      trackCount: tracks.length,
      tracks,
    });
  });
}
