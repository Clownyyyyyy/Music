"use client";

/** Liked songs view (ytmusicapi.get_liked_songs). */
import { useLiked } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Play, Shuffle, Heart } from "lucide-react";
import { formatLongDuration } from "@/lib/format";

export function LikedView() {
  const { data: pl, isLoading } = useLiked();

  if (isLoading || !pl) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl space-y-4">
        <Skeleton className="h-40 rounded-xl" />
        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  return (
    <div className="max-w-6xl">
      <div className="px-4 md:px-8 pt-6 pb-5 border-b border-border bg-muted/30">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
          <div className="w-40 h-40 md:w-52 md:h-52 rounded-xl bg-foreground text-background flex items-center justify-center shadow-xl">
            <Heart className="w-16 h-16 fill-current" />
          </div>
          <div className="min-w-0 text-center sm:text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Playlist</div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">Liked songs</h1>
            <div className="text-xs text-muted-foreground mt-1.5">
              You · {pl.trackCount} songs · {formatLongDuration(pl.duration_seconds || 0)}
            </div>
            <div className="flex items-center gap-2 mt-4">
              <Button
                className="rounded-full gap-1.5"
                onClick={() => pl.tracks.length && usePlayer.getState().playList(pl.tracks, 0, "playlist")}
                disabled={pl.tracks.length === 0}
              >
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button
                variant="outline"
                className="rounded-full gap-1.5"
                onClick={() =>
                  pl.tracks.length &&
                  usePlayer.getState().playList(pl.tracks, Math.floor(Math.random() * pl.tracks.length), "playlist", { shuffle: true })
                }
                disabled={pl.tracks.length === 0}
              >
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 md:px-8 py-4">
        {pl.tracks.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Tap the heart on any song to fill this list.
          </div>
        ) : (
          <div className="space-y-0.5">
            {pl.tracks.map((t, i) => <SongRow key={t.videoId} song={t} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
