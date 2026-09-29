"use client";

/**
 * Library — the user's own data (local, no YouTube account required):
 * Playlists (local + liked) · Songs (liked) · Recently played.
 * Sort a→z / z→a / recently added (spec: sort and filter music).
 */
import { useMemo, useState } from "react";
import { navigate } from "@/lib/router";
import { usePlaylists, useLiked, useHistory } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import { PlaylistCard } from "@/components/shared/Cards";
import { CreatePlaylistDialog } from "@/components/shared/CreatePlaylistDialog";
import type { PlaylistSummary, Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Play, Shuffle, Heart, Plus } from "lucide-react";

const TABS = [
  { id: "playlists", label: "Playlists" },
  { id: "songs", label: "Liked songs" },
  { id: "recent", label: "Recently played" },
];

const ORDERS = [
  { id: "recently_added", label: "Recently added" },
  { id: "a_to_z", label: "A → Z" },
  { id: "z_to_a", label: "Z → A" },
];

export function LibraryView({ tab }: { tab: string }) {
  const activeTab = TABS.some((t) => t.id === tab) ? tab : "playlists";
  const [order, setOrder] = useState("recently_added");
  const { data: playlists, isLoading: plLoading } = usePlaylists();
  const { data: liked, isLoading: likedLoading } = useLiked();
  const { data: history, isLoading: histLoading } = useHistory();

  const recentSongs = useMemo<Song[]>(() => {
    if (!history) return [];
    const seen = new Set<string>();
    const out: Song[] = [];
    for (const day of history) {
      for (const entry of day.entries) {
        if (!seen.has(entry.videoId)) {
          seen.add(entry.videoId);
          out.push(entry);
        }
      }
    }
    return out;
  }, [history]);

  const sortSongs = (list: Song[]): Song[] => {
    const arr = [...list];
    if (order === "a_to_z") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (order === "z_to_a") arr.sort((a, b) => b.title.localeCompare(a.title));
    // recently_added keeps natural order (likes/recent are already newest-first)
    return arr;
  };

  const likedSongs = sortSongs(liked?.tracks || []);
  const recent = sortSongs(recentSongs);

  const playAll = (list: Song[]) => {
    if (list.length > 0) usePlayer.getState().playList(list, 0, "library");
  };

  const isLoading = plLoading || likedLoading || histLoading;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl md:text-3xl font-extrabold">Library</h1>
        <div className="flex items-center gap-2">
          {activeTab === "songs" && likedSongs.length > 0 && (
            <>
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => playAll(likedSongs)}>
                <Play className="w-3.5 h-3.5 fill-current" /> Play all
              </Button>
              <Button
                variant="outline" size="sm" className="rounded-full gap-1.5"
                onClick={() => usePlayer.getState().playList(likedSongs, 0, "library", { shuffle: true })}
              >
                <Shuffle className="w-3.5 h-3.5" /> Shuffle
              </Button>
            </>
          )}
          {activeTab === "recent" && recent.length > 0 && (
            <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => playAll(recent)}>
              <Play className="w-3.5 h-3.5 fill-current" /> Play all
            </Button>
          )}
          <CreatePlaylistDialog>
            <Button size="sm" className="rounded-full gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New playlist
            </Button>
          </CreatePlaylistDialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => navigate(`/library/${t.id}`)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors",
              activeTab === t.id ? "bg-foreground text-background" : "border border-border hover:bg-accent"
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className="h-8 rounded-full border border-border bg-background px-3 text-xs font-bold"
            aria-label="Sort order"
          >
            {ORDERS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      )}

      {!isLoading && activeTab === "playlists" && (
        <div className="space-y-5">
          <button
            className="group w-full flex items-center gap-4 rounded-xl border border-border p-4 hover:bg-accent transition-colors text-left"
            onClick={() => navigate("/playlist/LIKED")}
          >
            <div className="w-16 h-16 rounded-lg bg-foreground text-background flex items-center justify-center">
              <Heart className="w-7 h-7 fill-current" />
            </div>
            <div>
              <div className="font-display font-extrabold">Liked songs</div>
              <div className="text-xs text-muted-foreground">{liked?.trackCount ?? 0} songs you loved</div>
            </div>
          </button>
          {(playlists || []).length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
              {(playlists as PlaylistSummary[]).map((p) => <PlaylistCard key={p.playlistId} playlist={p} />)}
            </div>
          ) : (
            <Empty text="No playlists yet — create one to get started" />
          )}
        </div>
      )}

      {!isLoading && activeTab === "songs" && (
        <div className="space-y-0.5">
          {likedSongs.map((s, i) => <SongRow key={s.videoId} song={s} index={i} />)}
          {likedSongs.length === 0 && <Empty text="Songs you like appear here — tap the heart on any track" />}
        </div>
      )}

      {!isLoading && activeTab === "recent" && (
        <div className="space-y-0.5">
          {recent.slice(0, 100).map((s, i) => <SongRow key={`${s.videoId}-${i}`} song={s} index={i} />)}
          {recent.length === 0 && <Empty text="Your listening history shows up here" />}
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="col-span-full py-14 text-center text-sm text-muted-foreground">{text}</div>;
}
