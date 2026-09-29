"use client";

/**
 * Playlist view — dual mode:
 * - kind "yt": REAL public YouTube Music playlists (RDCLAK5uy/PL/OLAK5uy…),
 *   read-only, with related playlists.
 * - kind "local": user-owned playlists — edit details, add songs (search),
 *   reorder (dnd), remove.
 */
import { useState } from "react";
import { useYtPlaylist, useLocalPlaylist, useEditPlaylist, useDeletePlaylist, usePlaylistItems } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import { PlaylistCard } from "@/components/shared/Cards";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatLongDuration } from "@/lib/format";
import {
  Play, Shuffle, Radio, MoreHorizontal, Pencil, Trash2, Search, ListMusic, AlertCircle, Youtube,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { navigate } from "@/lib/router";
import type { Song } from "@/lib/types";

/** real YT playlist ids start with these prefixes; local ids are cuids */
const isYtPlaylistId = (id: string) => /^(PL|RD|OLAK5uy|LM)/.test(id);

export function PlaylistView({ id }: { id: string | undefined }) {
  const yt = isYtPlaylistId(id || "");
  if (yt) return <YtPlaylistView id={id || ""} />;
  return <LocalPlaylistView id={id || ""} />;
}

/* ------------------------------------------------------------- YT kind --- */

function YtPlaylistView({ id }: { id: string }) {
  const { data: pl, isLoading, isError } = useYtPlaylist(id);

  if (isLoading) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl space-y-6">
        <Skeleton className="h-44 rounded-xl" />
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </div>
    );
  }

  if (isError || !pl) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl">
        <div className="rounded-xl border border-border p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
          <h1 className="font-display text-xl font-extrabold mt-3">Playlist unavailable</h1>
          <p className="text-sm text-muted-foreground mt-1">Could not load this playlist from YouTube Music.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate("/")}>Back home</Button>
        </div>
      </div>
    );
  }

  const play = (shuffle = false) => {
    if (pl.tracks.length) usePlayer.getState().playList(pl.tracks, 0, "playlist", { shuffle });
  };

  const radio = async () => {
    const seed = pl.tracks[0]?.videoId;
    if (!seed) return;
    const res = await fetch(`/api/watch?videoId=${seed}&radio=true&limit=25`);
    const json = await res.json();
    const existing = new Set(pl.tracks.map((t) => t.videoId));
    const merged = [...pl.tracks, ...(json.tracks || []).filter((t: Song) => !existing.has(t.videoId))];
    usePlayer.getState().playList(merged, 0, "radio", { radio: true });
  };

  return (
    <div className="max-w-6xl">
      <div className="px-4 md:px-8 pt-6 pb-5 border-b border-border bg-muted/30">
        <div className="flex flex-col sm:flex-row gap-5">
          <img
            src={pl.cover}
            alt={`${pl.title} cover`}
            className="w-40 h-40 md:w-52 md:h-52 rounded-xl object-cover shadow-xl bw mx-auto sm:mx-0"
          />
          <div className="flex flex-col justify-end min-w-0 text-center sm:text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-bold flex items-center gap-1.5 justify-center sm:justify-start">
              <Youtube className="w-3.5 h-3.5" /> Playlist
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">{pl.title}</h1>
            {pl.description && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{pl.description}</p>}
            <div className="text-xs text-muted-foreground mt-1.5">
              {pl.author.name} · {pl.trackCount} songs{pl.year ? ` · ${pl.year}` : ""}
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
              <Button className="rounded-full gap-1.5" onClick={() => play(false)} disabled={pl.tracks.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={() => play(true)} disabled={pl.tracks.length === 0}>
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={radio} disabled={pl.tracks.length === 0}>
                <Radio className="w-4 h-4" /> Radio
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4 space-y-6">
        {pl.tracks.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            <ListMusic className="w-8 h-8 mx-auto mb-2" />
            This playlist is empty.
          </div>
        ) : (
          <div className="space-y-0.5">
            {pl.tracks.map((t, i) => (
              <SongRow key={`${t.videoId}-${i}`} song={t} index={i} />
            ))}
          </div>
        )}

        {pl.related && pl.related.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-extrabold mb-3">Related playlists</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
              {pl.related.map((p) => <PlaylistCard key={p.playlistId} playlist={p} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- local kind --- */

function LocalPlaylistView({ id }: { id: string }) {
  const { data: pl, isLoading } = useLocalPlaylist(id);
  const edit = useEditPlaylist(id);
  const del = useDeletePlaylist();
  const { add, remove, reorder } = usePlaylistItems(id);
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<Song[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const seedEdit = () => {
    if (!pl) return;
    setTitle(pl.title);
    setDescription(pl.description || "");
    setEditOpen(true);
  };

  if (isLoading || !pl) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl space-y-6">
        <Skeleton className="h-44 rounded-xl" />
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </div>
    );
  }

  const play = (shuffle = false) => {
    if (pl.tracks.length) usePlayer.getState().playList(pl.tracks, 0, "playlist", { shuffle });
  };

  const radio = async () => {
    const seed = pl.tracks[pl.tracks.length - 1]?.videoId;
    if (!seed) return;
    const res = await fetch(`/api/watch?videoId=${seed}&radio=true&limit=25`);
    const json = await res.json();
    const seedTrack = pl.tracks[0];
    const existing = new Set(pl.tracks.map((t) => t.videoId));
    const merged = seedTrack
      ? [seedTrack, ...(json.tracks || []).filter((t: Song) => !existing.has(t.videoId))]
      : json.tracks || [];
    usePlayer.getState().playList(merged, 0, "radio", { radio: true });
  };

  const saveEdit = () => {
    edit.mutate(
      { title, description },
      {
        onSuccess: () => {
          setEditOpen(false);
          toast({ title: "Playlist updated" });
        },
      }
    );
  };

  const deletePlaylist = () => {
    del.mutate(id, {
      onSuccess: () => {
        toast({ title: "Playlist deleted", description: pl.title });
        navigate("/library/playlists");
      },
    });
  };

  const searchToAdd = async (q: string) => {
    if (!q.trim()) return setAddResults([]);
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&filter=songs&limit=10`);
    const json = await res.json();
    setAddResults((json.results?.length ? json.results : json.songs || []) as Song[]);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !pl) return;
    const itemIdOf = (t: Song) => (t as Song & { itemId?: string }).itemId || t.videoId;
    const items = [...pl.tracks];
    const from = items.findIndex((t) => itemIdOf(t) === active.id);
    const to = items.findIndex((t) => itemIdOf(t) === over.id);
    if (from < 0 || to < 0) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    reorder.mutate(items.map(itemIdOf));
  };

  return (
    <div className="max-w-6xl">
      <div className="px-4 md:px-8 pt-6 pb-5 border-b border-border bg-muted/30">
        <div className="flex flex-col sm:flex-row gap-5">
          <img
            src={pl.cover}
            alt={`${pl.title} cover`}
            className="w-40 h-40 md:w-52 md:h-52 rounded-xl object-cover shadow-xl bw mx-auto sm:mx-0"
          />
          <div className="flex flex-col justify-end min-w-0 text-center sm:text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Playlist</div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1 truncate">{pl.title}</h1>
            {pl.description && <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{pl.description}</p>}
            <div className="text-xs text-muted-foreground mt-1.5">
              {pl.author.name} · {pl.trackCount} songs
              {pl.duration_seconds ? ` · ${formatLongDuration(pl.duration_seconds)}` : ""}
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
              <Button className="rounded-full gap-1.5" onClick={() => play(false)} disabled={pl.tracks.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={() => play(true)} disabled={pl.tracks.length === 0}>
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={radio} disabled={pl.tracks.length === 0}>
                <Radio className="w-4 h-4" /> Radio
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="rounded-full" aria-label="Playlist options">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-44">
                  <DropdownMenuItem onClick={seedEdit}>
                    <Pencil className="w-4 h-4 mr-2" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={deletePlaylist} className="text-destructive">
                    <Trash2 className="w-4 h-4 mr-2" /> Delete playlist
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4 space-y-6">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setAddOpen(true)}>
            <Search className="w-3.5 h-3.5" /> Add songs
          </Button>
        </div>

        {pl.tracks.length === 0 ? (
          <div className="py-14 text-center text-sm text-muted-foreground">
            <ListMusic className="w-8 h-8 mx-auto mb-2" />
            Add some songs to get started.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext
              items={pl.tracks.map((t) => (t as Song & { itemId?: string }).itemId || t.videoId)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5">
                {pl.tracks.map((t, i) => {
                  const itemId = (t as Song & { itemId?: string }).itemId || t.videoId;
                  return (
                    <SortableSongRow
                      key={`${t.videoId}-${i}`}
                      id={itemId}
                      song={t}
                      index={i}
                      onRemove={() => remove.mutate([itemId])}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-extrabold">Edit playlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pl-title">Title</Label>
              <Input id="pl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pl-desc">Description</Label>
              <Textarea id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={!title.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* add songs dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-extrabold">Add songs</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={addQuery}
              onChange={(e) => {
                setAddQuery(e.target.value);
                searchToAdd(e.target.value);
              }}
              placeholder="Search YouTube Music to add…"
              className="pl-9"
              autoFocus
            />
          </div>
          <div className="max-h-72 overflow-y-auto space-y-0.5">
            {addResults.map((s) => {
              const already = pl.tracks.some((t) => t.videoId === s.videoId);
              return (
                <button
                  key={s.videoId}
                  disabled={already || add.isPending}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-accent transition-colors",
                    already && "opacity-40"
                  )}
                  onClick={() =>
                    add.mutate(
                      { videoIds: [s.videoId], tracks: [s] },
                      { onSuccess: () => toast({ title: "Added", description: `"${s.title}" → ${pl.title}` }) }
                    )
                  }
                >
                  <img src={s.cover} alt="" className="w-9 h-9 rounded object-cover bw" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate">{s.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{s.artistName}</div>
                  </div>
                  <span className="text-xs text-muted-foreground">{already ? "Added" : s.duration}</span>
                </button>
              );
            })}
            {addQuery && addResults.length === 0 && (
              <div className="py-6 text-center text-sm text-muted-foreground">No matches</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableSongRow({ id, song, index, onRemove }: { id: string; song: Song; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && "relative z-10")}
    >
      <div className="flex items-center gap-1.5">
        <button
          className="text-muted-foreground/50 hover:text-foreground cursor-grab active:cursor-grabbing touch-none px-0.5"
          {...attributes}
          {...listeners}
          aria-label="Reorder track"
        >
          ⠿
        </button>
        <div className="flex-1 min-w-0">
          <SongRow song={song} index={index} onRemove={onRemove} compact />
        </div>
      </div>
    </div>
  );
}
