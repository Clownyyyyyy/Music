import { ytService } from "@/lib/yt-service";
import { bestThumb, normAlbumList, normSongList } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/** GET /api/albums/[id] — real album (browseId MPREb_...) with track list. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const data = await ytService.album(id);
    const artists = (Array.isArray(data.artists) && data.artists.length
      ? data.artists.map((a: Record<string, any>) => ({ name: a?.name || "Unknown artist", id: a?.id || null }))
      : [{ name: "Unknown artist", id: null }]);
    // Drop unavailable entries (YouTube returns videoId:null for region-locked
    // tracks) so the track list and the header count always agree.
    const available = (Array.isArray(data.tracks) ? data.tracks : []).filter(
      (t: Record<string, any>) => t?.videoId
    );
    const tracks = normSongList(available).map((t) => ({
      ...t,
      album: { name: data.title, id },
      albumId: id,
      albumTitle: data.title,
      cover: t.cover || bestThumb(data.thumbnails),
    }));
    return Response.json({
      browseId: id,
      playlistId: data.audioPlaylistId || null,
      title: data.title || "Unknown album",
      artists,
      artistName: artists[0].name,
      year: data.year ? Number(data.year) : null,
      thumbnails: data.thumbnails || [],
      cover: bestThumb(data.thumbnails),
      trackCount: tracks.length || data.trackCount || 0,
      duration: data.duration || "",
      duration_seconds: tracks.reduce((a, t) => a + (t.duration_seconds || 0), 0),
      type: data.type || "Album",
      tracks,
      artistAvatar: "",
      otherVersions: normAlbumList(data.other_versions || []),
    });
  });
}
