import { db } from "@/lib/db";
import { safe } from "@/lib/api-helpers";

/** GET /api/profile — local profile stats. */
export async function GET() {
  return safe(async () => {
    const [liked, playlists, playedTracks, historyEntries] = await Promise.all([
      db.likedTrack.count(),
      db.playlist.count(),
      db.playStat.count(),
      db.historyEntry.count(),
    ]);
    return Response.json({
      displayName: "Listener",
      memberSince: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      counts: { liked, playlists, playedTracks, historyEntries },
    });
  });
}
