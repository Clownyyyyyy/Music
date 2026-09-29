import { ytService } from "@/lib/yt-service";
import { safe } from "@/lib/api-helpers";

/**
 * GET /api/lyrics/[id] — YouTube Music lyrics. Availability depends on the
 * track (and YouTube's bot-gating of datacenter IPs); the UI degrades to a
 * friendly "unavailable" state.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return safe(async () => {
    const { id } = await ctx.params;
    const data = await ytService.lyrics(id);
    if (!data?.lyrics) return Response.json(null);
    return Response.json({
      hasTimestamps: !!data.hasTimestamps,
      source: "YouTube Music",
      lyrics: data.lyrics,
    });
  });
}
