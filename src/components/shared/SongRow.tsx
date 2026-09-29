"use client";

/**
 * SongRow — the reusable track list row with hover play, like button,
 * and a context menu (add to playlist, queue, go to album/artist, radio).
 */
import { navigate } from "@/lib/router";
import { usePlayer } from "@/store/player-store";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Play, Heart, ListPlus, ListEnd, Disc3, User, PlusCircle, Radio, Youtube } from "lucide-react";
import { useState } from "react";
import { AddToPlaylistDialog } from "@/components/shared/AddToPlaylistDialog";

interface Props {
  song: import("@/lib/types").Song;
  index?: number;
  showAlbum?: boolean;
  showViews?: boolean;
  onRemove?: () => void;
  onPlay?: () => void;
  compact?: boolean;
}

export function SongRow({ song, index, showAlbum = true, showViews = false, onRemove, onPlay, compact }: Props) {
  const { current, playing, playNow, addToQueue, toggleLike } = usePlayer();
  const isCurrent = current?.videoId === song.videoId;
  const isPlaying = isCurrent && playing;
  const [addOpen, setAddOpen] = useState(false);
  const likeStatus = song.likeStatus;

  const like = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleLike(song);
  };

  const artistId = song.artists?.[0]?.id || "";
  const openYouTube = (e: React.MouseEvent) => {
    e.stopPropagation();
    window.open(`https://www.youtube.com/watch?v=${song.videoId}`, "_blank", "noopener");
  };

  const startRadio = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetch(`/api/watch?videoId=${song.videoId}&radio=true&limit=25`)
      .then((r) => r.json())
      .then((json) => {
        const tracks = (json.tracks || []) as import("@/lib/types").Song[];
        const list = tracks.length ? tracks : [song];
        usePlayer.getState().playList(list, 0, "radio", { radio: true });
      })
      .catch(() => usePlayer.getState().playList([song], 0, "radio", { radio: true }));
  };

  return (
    <div
      className={cn(
        "group grid grid-cols-[2rem_1fr_auto] md:grid-cols-[2rem_minmax(0,2.2fr)_minmax(0,1.6fr)_auto] items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent transition-colors cursor-pointer",
        isCurrent && "bg-accent/70"
      )}
      onClick={() => (onPlay ? onPlay() : playNow(song, "list"))}
      onDoubleClick={() => playNow(song)}
      role="button"
      aria-label={`Play ${song.title} by ${song.artistName}`}
    >
      <div className="w-8 h-8 flex items-center justify-center text-sm text-muted-foreground">
        {isPlaying ? (
          <span className="bw-eq text-foreground">
            <span /><span /><span /><span />
          </span>
        ) : (
          <>
            <span className="group-hover:hidden">{index != null ? index + 1 : <Disc3 className="w-4 h-4" />}</span>
            <button
              className="hidden group-hover:block"
              onClick={(e) => { e.stopPropagation(); if (onPlay) onPlay(); else playNow(song, "list"); }}
              aria-label={`Play ${song.title}`}
            >
              <Play className="w-4 h-4 fill-current" />
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-3 min-w-0">
        <img src={song.cover} alt="" className="w-10 h-10 rounded-md object-cover bw" loading="lazy" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn("truncate text-sm font-bold", isCurrent && "text-foreground")}>{song.title}</span>
            {song.isExplicit && (
              <span className="shrink-0 text-[9px] font-black border border-muted-foreground/60 rounded-sm px-1 py-px text-muted-foreground">E</span>
            )}
          </div>
          {artistId ? (
            <button
              className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline"
              onClick={(e) => { e.stopPropagation(); navigate(`/artist/${artistId}`); }}
            >
              {song.artistName}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground truncate">{song.artistName}</span>
          )}
        </div>
      </div>

      {showAlbum && (
        <button
          className="hidden md:block text-xs text-muted-foreground truncate hover:text-foreground hover:underline text-left"
          onClick={(e) => { e.stopPropagation(); if (song.albumId) navigate(`/album/${song.albumId}`); }}
        >
          {song.albumTitle}
        </button>
      )}

      <div className="flex items-center gap-1.5">
        {showViews && song.views && (
          <span className="hidden lg:block text-[11px] text-muted-foreground w-16 text-right truncate">{song.views}</span>
        )}
        <button
          onClick={like}
          className={cn("p-1.5 rounded-full transition-opacity",
            likeStatus === "LIKE" ? "text-foreground opacity-100" : "text-muted-foreground/50 opacity-0 group-hover:opacity-100 focus:opacity-100")}
          aria-label={likeStatus === "LIKE" ? "Unlike" : "Like"}
        >
          <Heart className={cn("w-4 h-4", likeStatus === "LIKE" && "fill-current")} />
        </button>
        <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">{song.duration}</span>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="p-1.5 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground" aria-label="More options">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); if (onPlay) onPlay(); else playNow(song, "list"); }}>
              <Play className="w-4 h-4 mr-2" /> Play now
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); addToQueue([song], "next"); }}>
              <ListPlus className="w-4 h-4 mr-2" /> Play next
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); addToQueue([song], "end"); }}>
              <ListEnd className="w-4 h-4 mr-2" /> Add to queue
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setAddOpen(true); }}>
              <PlusCircle className="w-4 h-4 mr-2" /> Add to playlist
            </DropdownMenuItem>
            <DropdownMenuItem onClick={startRadio}>
              <Radio className="w-4 h-4 mr-2" /> Start radio
            </DropdownMenuItem>
            {song.albumId && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/album/${song.albumId}`); }}>
                <Disc3 className="w-4 h-4 mr-2" /> Go to album
              </DropdownMenuItem>
            )}
            {artistId && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/artist/${artistId}`); }}>
                <User className="w-4 h-4 mr-2" /> Go to artist
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openYouTube}>
              <Youtube className="w-4 h-4 mr-2" /> Open on YouTube
            </DropdownMenuItem>
            {onRemove && (
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRemove(); }} className="text-destructive">
                Remove from this list
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AddToPlaylistDialog open={addOpen} onOpenChange={setAddOpen} song={song} />
      {!compact && isPlaying && <span className="sr-only">Playing</span>}
    </div>
  );
}
