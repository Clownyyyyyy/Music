import { ytService } from "@/lib/yt-service";
import { safe } from "@/lib/api-helpers";

/** GET /api/suggestions?q= — YouTube Music search suggestions. */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") || "").trim();
    if (!q) return Response.json([]);
    const res = await ytService.suggestions(q);
    // detailed_runs response: [{suggestion|text, runs}] — flatten to strings.
    // ytmusicapi versions differ: some emit `suggestion`, current emits `text`.
    if (Array.isArray(res) && res.length > 0 && typeof res[0] === "object") {
      return Response.json(
        (res as Record<string, any>[])
          .map((r) => r.suggestion ?? r.text ?? "")
          .filter(Boolean)
      );
    }
    return Response.json(res);
  });
}
