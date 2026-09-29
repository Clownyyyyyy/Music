import { ytService } from "@/lib/yt-service";
import { normMoodCategories } from "@/lib/normalize";
import { safe } from "@/lib/api-helpers";

/** GET /api/moods/categories — real Moods & moments + Genres categories. */
export async function GET() {
  return safe(async () => {
    const data = await ytService.moodCategories();
    return Response.json(normMoodCategories(data));
  });
}
