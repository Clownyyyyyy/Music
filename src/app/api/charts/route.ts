import { ytService } from "@/lib/yt-service";
import { normCharts } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/** GET /api/charts?country=US — real YouTube Music charts (songs/artists/genres). */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const country = (url.searchParams.get("country") || "ZZ").toUpperCase();
    const data = await ytService.charts(country);
    let chart = normCharts(data, country);
    if (chart.songs.length === 0) {
      // Bot-gated video chart: YouTube returns a playlist stub (e.g.
      // "Daily Top Music Videos - Global") instead of ranked videos. Resolve
      // the REAL chart through that playlist — still 100% YouTube Music data.
      const stub = (Array.isArray(data?.videos) ? data.videos : []).find(
        (v: Record<string, any>) => v?.playlistId
      );
      if (stub?.playlistId) {
        try {
          const pl = await ytService.playlist(stub.playlistId, 40);
          const items = (pl?.tracks || []).slice(0, 40).map(
            (t: Record<string, any>, i: number) => ({
              videoId: t.videoId,
              title: t.title,
              artists: Array.isArray(t.artists) && t.artists.length ? t.artists : [{ name: "Unknown artist" }],
              thumbnails: t.thumbnails,
              views: t.views || "",
              rank: String(i + 1),
              trend: "NEUTRAL",
            })
          );
          if (items.length > 0) {
            chart = { ...chart, songs: normCharts({ ...data, videos: items }, country).songs };
          }
        } catch {
          /* keep whatever we have — artists chart still renders */
        }
      }
    }
    return Response.json(chart);
  });
}
