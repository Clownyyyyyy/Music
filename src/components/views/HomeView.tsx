"use client";

/** Home — real YouTube Music home feed (ytmusicapi.get_home) + smart mixes. */
import { useSyncExternalStore } from "react";
import { useHome, useProfile, useMixes } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { timeGreeting } from "@/lib/format";
import { AlbumCard, ArtistCard, PlaylistCard, PlayButton } from "@/components/shared/Cards";
import { SongRow } from "@/components/shared/SongRow";
import { Skeleton } from "@/components/ui/skeleton";
import type { Album, Artist, PlaylistSummary, Song } from "@/lib/types";
import { Play, Sparkles, Clock, Disc3, Smile, Sun, Repeat2, Compass, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

const subscribeNoop = () => () => {};

export function HomeView() {
  const { data: rows, isLoading, isError, refetch } = useHome();
  const { data: profile } = useProfile();
  const { data: mixes } = useMixes();
  const playList = usePlayer((s) => s.playList);

  // Hydration-safe greeting: `timeGreeting()` depends on the local clock, so it
  // must NEVER be computed during SSR (server UTC vs client Asia/Kolkata
  // produced "Good morning" vs "Good afternoon" mismatches). useSyncExternalStore
  // renders the server snapshot ("") during SSR + hydration, then switches to
  // the real client-side greeting after hydration — no mismatch, no effect.
  const greeting = useSyncExternalStore(subscribeNoop, timeGreeting, () => "");

  const playRow = (contents: (Song | Album | Artist | PlaylistSummary)[]) => {
    const songs = contents.filter((c) => "videoId" in c) as Song[];
    if (songs.length) playList(songs, 0, "home");
  };

  const mixIcon = (id: string) =>
    id === "on-repeat" ? Repeat2 : id === "discover" ? Compass : Radio;

  const rowIcon = (title: string) => {
    if (title.toLowerCase().includes("recommended")) return Sparkles;
    if (title.toLowerCase().includes("listen again")) return Clock;
    if (title.toLowerCase().includes("new release")) return Disc3;
    if (title.toLowerCase().includes("moods")) return Smile;
    if (title.toLowerCase().includes("morning")) return Sun;
    return Sparkles;
  };

  return (
    <div className="px-4 md:px-8 py-6 space-y-8 max-w-6xl">
      <header className="pt-2">
        <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground font-bold">B&amp;W Music</div>
        <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">
          {greeting}{profile ? `, ${profile.displayName}` : ""}.
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Real YouTube Music — search, explore and stream.
        </p>
      </header>

      {isError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/50 px-4 py-3 text-sm">
          <span>Couldn’t reach YouTube Music just now. Check your connection — or retry.</span>
          <Button variant="outline" size="sm" className="rounded-full shrink-0" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="space-y-8">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        </div>
      )}

      {mixes && mixes.length > 0 && (
        <section aria-label="Smart mixes">
          <div className="flex items-center justify-between mb-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
              <Sparkles className="w-[18px] h-[18px]" /> Smart mixes
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
            {mixes.map((mix) => {
              const Icon = mixIcon(mix.id);
              return (
                <button
                  key={mix.id}
                  className="group text-left rounded-xl p-3 hover:bg-accent transition-colors"
                  onClick={() => playList(mix.tracks, 0, `mix:${mix.id}`, { radio: true })}
                >
                  <div className="relative mb-3">
                    <div className="aspect-square w-full rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-1.5">
                      <Icon className="w-7 h-7" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{mix.tracks.length} tracks</span>
                    </div>
                    <PlayButton onClick={() => playList(mix.tracks, 0, `mix:${mix.id}`, { radio: true })} />
                  </div>
                  <div className="font-bold text-sm truncate">{mix.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{mix.description}</div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {rows?.map((row) => {
        const Icon = rowIcon(row.title);
        const songs = row.contents.filter((c) => "videoId" in c) as Song[];
        const isSongRow = songs.length > 0 && songs.length === row.contents.length;
        return (
          <section key={row.title} aria-label={row.title}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-extrabold">
                <Icon className="w-4.5 h-4.5 w-[18px] h-[18px]" />
                {row.title}
              </h2>
              {isSongRow && songs.length > 1 && (
                <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => playRow(row.contents)}>
                  <Play className="w-3.5 h-3.5 fill-current" /> Play all
                </Button>
              )}
            </div>

            {isSongRow ? (
              <div className="space-y-0.5">
                {songs.slice(0, 6).map((song, i) => (
                  <SongRow key={song.videoId} song={song} index={i} showAlbum={false} />
                ))}
              </div>
            ) : (
              <div className="relative">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
                  {row.contents.map((c, i) => {
                    if ("videoId" in c) return <SongRow key={c.videoId} song={c as Song} index={i} showAlbum={false} />;
                    if ("browseId" in c && "subscribers" in c) return <ArtistCard key={c.browseId} artist={c as Artist} />;
                    if ("browseId" in c) return <AlbumCard key={c.browseId} album={c as Album} />;
                    if ("playlistId" in c) return <PlaylistCard key={c.playlistId} playlist={c as PlaylistSummary} />;
                    return null;
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

export { PlayButton };
