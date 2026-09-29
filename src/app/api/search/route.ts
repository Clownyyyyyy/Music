import { ytService } from "@/lib/yt-service";
import { normSearchResults } from "@/lib/normalize";
import { apiError, safe } from "@/lib/api-helpers";

/**
 * GET /api/search?q=&filter=&limit=
 * filter: songs | videos | albums | artists | playlists | community_playlists |
 *         featured_playlists — ytmusicapi-style filters. Empty filter returns
 *         the full multi-result payload (top result + every category).
 */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || url.searchParams.get("query") || "").trim();
    const filter = url.searchParams.get("filter") || undefined;
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
    const ignoreSpelling = url.searchParams.get("ignore_spelling") === "true";
    if (!q) return apiError("missing q", 400);
    const validFilters = new Set([
      "songs", "videos", "albums", "artists", "playlists",
      "community_playlists", "featured_playlists", "profiles", "podcasts", "episodes",
    ]);
    if (filter && !validFilters.has(filter)) return apiError(`invalid filter: ${filter}`, 400);
    const results = await ytService.search(q, filter, limit, ignoreSpelling);
    // Always return the flat SearchResponse shape (top/songs/videos/albums/
    // artists/playlists) — a filtered query just fills one bucket. The old
    // `{ results: ... }` wrapper for filtered mode crashed the client, which
    // reads res.songs.length directly.
    return Response.json(normSearchResults(results));
  });
}
