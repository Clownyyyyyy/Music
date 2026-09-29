import { ytService } from "@/lib/yt-service";
import { normSong, normSongList } from "@/lib/normalize";
import { snapshotToSong, upsertTrack, safe } from "@/lib/api-helpers";
import { db } from "@/lib/db";

/**
 * GET /api/songs/[id] — resolve a track by videoId.
 * Order: local snapshot -> watch playlist (returns the seed track first) ->
 * song detail (bot-gated for datacenter IPs; best effort).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    if (!id) return Response.json({ error: "missing id" }, { status: 400 });

    const snap = await db.track.findUnique({ where: { videoId: id } });
    if (snap) return Response.json({ ...snapshotToSong(snap), likeStatus: undefined, source: "snapshot" });

    try {
      const watch = await ytService.watch({ videoId: id, limit: 1 });
      const [first] = normSongList(watch.tracks);
      if (first && first.videoId === id) {
        await upsertTrack(first);
        return Response.json({ ...first, source: "watch" });
      }
    } catch { /* fall through */ }

    const song = await ytService.song(id);
    if (song?.gated || song?.videoDetails == null) {
      // minimal placeholder derived from the videoId itself
      return Response.json({
        videoId: id,
        title: "",
        artists: [],
        artistName: "",
        album: null, albumId: "", albumTitle: "",
        duration: "", duration_seconds: 0,
        thumbnails: [], cover: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        source: "placeholder",
      });
    }
    const vd = song.videoDetails;
    const s = normSong({
      videoId: id,
      title: vd.title,
      artists: vd.author ? [{ name: String(vd.author).replace(" - Topic", ""), id: null }] : [],
      duration_seconds: Number(vd.lengthSeconds) || 0,
      thumbnails: vd.thumbnail?.thumbnails,
    });
    if (s) await upsertTrack(s);
    return Response.json({ ...(s || {}), source: "song" });
  });
}
