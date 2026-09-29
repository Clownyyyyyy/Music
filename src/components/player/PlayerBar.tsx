"use client";

/**
 * PlayerBar — the mini player (spec: 🖥 Mini player): artwork, title/artist,
 * like, play/pause, next, seek bar with current & total duration, volume,
 * shuffle/repeat, queue toggle and expand-to-NowPlaying.
 */
import { navigate } from "@/lib/router";
import { usePlayer } from "@/store/player-store";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Play, Pause, SkipBack, SkipForward, Heart, Volume2, VolumeX, Volume1,
  ListMusic, ChevronUp, Shuffle, Repeat, Repeat1, PanelRightClose, PanelRightOpen,
} from "lucide-react";

export function PlayerBar({
  onExpand, onToggleQueue, queueOpen, onCloseQueue,
}: {
  onExpand: () => void;
  onToggleQueue: () => void;
  queueOpen: boolean;
  onCloseQueue: () => void;
}) {
  const {
    current, playing, toggle, next, prev, position, duration, seek,
    volume, muted, setVolume, toggleMute, shuffle, toggleShuffle, repeat, cycleRepeat, toggleLike,
  } = usePlayer();

  if (!current) {
    return (
      <div className="fixed bottom-14 md:bottom-0 inset-x-0 md:left-64 z-40 border-t border-border bg-background/95 backdrop-blur h-[72px] md:h-20 hidden" />
    );
  }

  const dur = duration || current.duration_seconds;
  const pct = dur > 0 ? (position / dur) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="fixed bottom-14 md:bottom-0 inset-x-0 md:left-64 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* seek bar */}
      <div className="relative h-1 group cursor-pointer" onClick={(e) => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        seek(((e.clientX - rect.left) / rect.width) * dur);
      }}>
        <div className="absolute inset-x-0 top-0 h-1 bg-muted" />
        <div className="absolute top-0 h-1 bg-foreground" style={{ width: `${pct}%` }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-foreground opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>

      <div className="flex items-center gap-3 px-3 md:px-5 h-[64px] md:h-[76px]">
        {/* track info */}
        <div
          className="flex items-center gap-3 min-w-0 flex-1 md:flex-none md:w-64 text-left cursor-pointer"
          onClick={onExpand}
          role="button"
          aria-label={`Now playing: ${current.title}`}
        >
          <img src={current.cover} alt="" className="w-11 h-11 rounded-md object-cover bw shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{current.title}</div>
            <button
              className="text-xs text-muted-foreground truncate hover:text-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                const artistId = current.artists?.[0]?.id;
                if (artistId) navigate(`/artist/${artistId}`);
              }}
            >
              {current.artistName}
            </button>
          </div>
          <ChevronUp className="w-4 h-4 text-muted-foreground hidden md:block shrink-0" />
        </div>

        {/* transport */}
        <div className="flex-1 flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost" size="icon"
              className={cn("hidden md:inline-flex w-9 h-9", shuffle && "text-foreground")}
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              aria-label="Shuffle"
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" className="w-9 h-9" onClick={prev} aria-label="Previous track">
              <SkipBack className="w-5 h-5 fill-current" />
            </Button>
            <Button
              size="icon"
              className="w-10 h-10 rounded-full"
              onClick={toggle}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </Button>
            <Button variant="ghost" size="icon" className="w-9 h-9" onClick={() => next(true)} aria-label="Next track">
              <SkipForward className="w-5 h-5 fill-current" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className={cn("hidden md:inline-flex w-9 h-9", repeat !== "off" && "text-foreground")}
              onClick={cycleRepeat}
              aria-label={`Repeat: ${repeat}`}
            >
              {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </Button>
          </div>
          <div className="hidden md:flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums w-full justify-center">
            <span>{formatTime(position)}</span>
            <span className="text-border">·</span>
            <span>{formatTime(dur)}</span>
          </div>
        </div>

        {/* right controls */}
        <div className="flex items-center gap-1 md:w-64 md:justify-end">
          <button
            onClick={() => toggleLike()}
            className={cn("p-2 rounded-full hover:bg-accent", current.likeStatus === "LIKE" ? "text-foreground" : "text-muted-foreground")}
            aria-label="Like"
          >
            <Heart className={cn("w-[18px] h-[18px]", current.likeStatus === "LIKE" && "fill-current")} />
          </button>
          <div className="hidden md:flex items-center gap-2 w-32">
            <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground" aria-label={muted ? "Unmute" : "Mute"}>
              <VolumeIcon className="w-[18px] h-[18px]" />
            </button>
            <Slider
              value={[muted ? 0 : Math.round(volume * 100)]}
              max={100}
              step={1}
              onValueChange={(v) => setVolume((v[0] || 0) / 100)}
              className="w-24"
              aria-label="Volume"
            />
          </div>
          <Button
            variant="ghost" size="icon"
            className={cn("hidden md:inline-flex w-9 h-9", queueOpen && "text-foreground")}
            onClick={queueOpen ? onCloseQueue : onToggleQueue}
            aria-label="Queue"
          >
            {queueOpen ? <PanelRightClose className="w-4 h-4" /> : <ListMusic className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
