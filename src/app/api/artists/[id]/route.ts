import { ytService } from "@/lib/yt-service";
import { bestThumb, normAlbumList, normArtistList, normSongList } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/** GET /api/artists/[id] — real artist channel: top songs, albums, singles, videos, related. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const d = await ytService.artist(id);
    const songs = normSongList(d?.songs?.results || []);
    const albums = normAlbumList(d?.albums?.results || []);
    const singles = normAlbumList(d?.singles?.results || []);
    const videos = normSongList(d?.videos?.results || []);
    const related = normArtistList(d?.related?.results || []);
    const thumbs = d?.thumbnails || d?.description?.thumbnails || [];
    const top5 = songs.slice(0, 5);
    const totalViews = videos.reduce((a, v) => a + (parseInt((v.views || "0").replace(/[^0-9]/g, ""), 10) || 0), 0);
    return Response.json({
      browseId: id,
      title: d?.name || "Unknown artist",
      name: d?.name || "Unknown artist",
      subscribers: d?.subscriberCount || null,
      monthlyListeners: d?.monthlyListeners || null,
      thumbnails: thumbs,
      avatar: bestThumb(thumbs, 500),
      description: d?.description || "",
      songs: { browseId: d?.songs?.browseId || null, results: songs },
      albums: { results: albums, params: d?.albums?.params || null, browseId: d?.albums?.browseId || null },
      singles: { results: singles },
      videos: { results: videos },
      related: { results: related },
      radioSeed: top5.length ? [top5[0].videoId, d?.songs?.playlistId || undefined].filter(Boolean) : [],
      stats: {
        trackCount: songs.length,
        views: totalViews > 0 ? `${(totalViews / 1e9).toFixed(1)}B` : "",
      },
    });
  });
}

/** GET /api/artists/[id]?albums=true&params= — paginated album section. */
export async function POST() {
  return Response.json({ error: "not supported" }, { status: 405 });
}
