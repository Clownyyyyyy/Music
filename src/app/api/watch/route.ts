import { ytService } from "@/lib/yt-service";
import { normSongList } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/**
 * GET /api/watch?videoId=&playlistId=&radio=&shuffle=&limit=
 * Real YouTube Music watch playlist (radio / related tracks) — used for
 * autoplay extension, "Start radio" and related-song mixes.
 */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const videoId = url.searchParams.get("videoId") || undefined;
    const playlistId = url.searchParams.get("playlistId") || undefined;
    const radio = url.searchParams.get("radio") === "true";
    const shuffle = url.searchParams.get("shuffle") === "true";
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 25));
    if (!videoId && !playlistId) {
      return Response.json({ error: "videoId or playlistId required" }, { status: 400 });
    }
    const data = await ytService.watch({ videoId, playlistId, radio, shuffle, limit });
    return Response.json({
      tracks: normSongList(data.tracks),
      playlistId: data.playlistId || null,
      lyricsBrowseId: data.lyrics || null,
    });
  });
}
