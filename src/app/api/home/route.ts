import { ytService } from "@/lib/yt-service";
import { normHomeRows } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/** GET /api/home — real YouTube Music home feed, normalized to rows. */
export async function GET(req: Request) {
  return safe(async () => {
    const url = new URL(req.url);
    const limit = Math.min(10, Math.max(1, Number(url.searchParams.get("limit")) || 4));
    const sections = await ytService.home(limit);
    return Response.json(normHomeRows(sections));
  });
}
