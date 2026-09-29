import { ytService } from "@/lib/yt-service";
import { normPlaylistSummary } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/** GET /api/moods/playlists?params= — real mood playlists for a category. */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const params = url.searchParams.get("params") || "";
    if (!params) return Response.json([]);
    const data = await ytService.moodPlaylists(params, 100);
    const list = (Array.isArray(data) ? data : [])
      .map((p) => normPlaylistSummary(p))
      .filter(Boolean) as NonNullable<ReturnType<typeof normPlaylistSummary>>[];
    // YouTube sometimes repeats the same playlist within a mood category — dedupe
    const seen = new Set<string>();
    const unique = list.filter((p) => {
      if (seen.has(p.playlistId)) return false;
      seen.add(p.playlistId);
      return true;
    });
    return Response.json(unique);
  });
}
