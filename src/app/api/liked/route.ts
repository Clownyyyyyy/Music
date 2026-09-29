import { db } from "@/lib/db";
import { snapshotToSong, upsertTrack, apiError, safe } from "@/lib/api-helpers";

/** GET /api/liked — the user's liked songs (local, newest first). */
export async function GET() {
  return safe(async () => {
    const rows = await db.likedTrack.findMany({
      orderBy: { addedAt: "desc" },
      include: { track: true },
    });
    const tracks = rows.map((r) => ({ ...snapshotToSong(r.track), likeStatus: "LIKE" as const }));
    return Response.json({
      playlistId: "LIKED",
      id: "LIKED",
      title: "Liked songs",
      kind: "local",
      cover: tracks[0]?.cover || "",
      trackCount: tracks.length,
      tracks,
      author: { name: "You", id: null },
    });
  });
}

/**
 * POST /api/liked — set like state.
 * Body: { videoId, rating: "LIKE" | "INDIFFERENT", track? (snapshot) }
 * The rating is the DESIRED end state (idempotent, unlike a blind toggle).
 */
export async function POST(req: Request) {
  return safe(async () => {
    const body = await req.json().catch(() => null);
    const videoId: string | undefined = body?.videoId;
    const rating: string = body?.rating;
    if (!videoId || !["LIKE", "INDIFFERENT"].includes(rating)) {
      return apiError("videoId and rating (LIKE|INDIFFERENT) required", 400);
    }
    if (body?.track) await upsertTrack({ ...body.track, videoId });

    if (rating === "LIKE") {
      await db.likedTrack.upsert({
        where: { videoId },
        create: { videoId },
        update: {},
      });
    } else {
      await db.likedTrack.deleteMany({ where: { videoId } });
    }
    return Response.json({ status: rating, liked: rating === "LIKE" });
  });
}
