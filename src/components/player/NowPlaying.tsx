"use client";

/**
 * NowPlaying — full-screen player (spec: 🖥 Full-screen Now Playing screen):
 * large artwork, seek, full controls, playback speed, volume, and panels:
 * Up next queue · Lyrics · Track info.
 *
 * Note: the Web-Audio visualizer and equalizer panels were removed —
 * cross-origin YouTube streams cannot be routed through the AudioContext.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { navigate } from "@/lib/router";
import { usePlayer } from "@/store/player-store";
import { useLyrics } from "@/lib/api";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QueuePanel } from "@/components/player/QueuePanel";
import {
  ChevronDown, Play, Pause, SkipBack, SkipForward, Heart, Shuffle, Repeat, Repeat1,
  Volume2, VolumeX, Volume1, Gauge, Info, Youtube,
} from "lucide-react";

// rates the YouTube player actually supports
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const {
    current, playing, toggle, next, prev, position, duration, seek,
    volume, muted, setVolume, toggleMute, shuffle, toggleShuffle,
    repeat, cycleRepeat, toggleLike, speed, setSpeed,
  } = usePlayer();

  const [speedOpen, setSpeedOpen] = useState(false);
  const dur = duration || current?.duration_seconds || 0;
  const pct = dur > 0 ? (position / dur) * 100 : 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  if (!current) return null;

  const artistId = current.artists?.[0]?.id;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col" role="dialog" aria-label="Now playing">
      {/* header */}
      <div className="flex items-center justify-between px-4 md:px-6 h-16 shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close now playing">
          <ChevronDown className="w-6 h-6" />
        </Button>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Playing from</div>
          <button
            className="text-sm font-bold hover:underline"
            onClick={() => {
              if (current.albumId) { navigate(`/album/${current.albumId}`); onClose(); }
            }}
          >
            {current.albumTitle || current.artistName}
          </button>
        </div>
        <div className="w-10" />
      </div>

      <div className="flex-1 min-h-0 grid lg:grid-cols-2 gap-6 px-4 md:px-8 pb-6 overflow-y-auto lg:overflow-hidden">
        {/* left: artwork + controls */}
        <div className="flex flex-col items-center justify-center gap-5 min-h-0">
          <div className="relative w-[min(72vw,340px)] lg:w-[min(36vh+6vw,420px)] aspect-square">
            <img
              src={current.cover}
              alt={`${current.title} artwork`}
              className={cn("w-full h-full object-cover rounded-xl shadow-2xl bw", playing && "ring-1 ring-foreground/20")}
            />
          </div>

          <div className="w-full max-w-lg text-center">
            <div className="font-display text-2xl font-extrabold truncate">{current.title}</div>
            <button
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => { if (artistId) { navigate(`/artist/${artistId}`); onClose(); } }}
            >
              {current.artistName}
            </button>
          </div>

          {/* seek */}
          <div className="w-full max-w-lg">
            <Slider
              value={[Math.min(100, pct)]}
              max={100}
              step={0.1}
              onValueChange={(v) => seek(((v[0] || 0) / 100) * dur)}
              aria-label="Seek"
            />
            <div className="flex justify-between text-xs text-muted-foreground tabular-nums mt-1.5">
              <span>{formatTime(position)}</span>
              <span>{formatTime(dur)}</span>
            </div>
          </div>

          {/* controls */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost" size="icon"
              className={cn("w-11 h-11", shuffle && "text-foreground")}
              onClick={toggleShuffle}
              aria-pressed={shuffle}
              aria-label="Shuffle"
            >
              <Shuffle className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="w-12 h-12" onClick={prev} aria-label="Previous">
              <SkipBack className="w-6 h-6 fill-current" />
            </Button>
            <Button size="icon" className="w-14 h-14 rounded-full" onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current" />}
            </Button>
            <Button variant="ghost" size="icon" className="w-12 h-12" onClick={() => next(true)} aria-label="Next">
              <SkipForward className="w-6 h-6 fill-current" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className={cn("w-11 h-11", repeat !== "off" && "text-foreground")}
              onClick={cycleRepeat}
              aria-label={`Repeat ${repeat}`}
            >
              {repeat === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
            </Button>
          </div>

          {/* bottom row: like, speed, volume */}
          <div className="w-full max-w-lg flex items-center gap-3">
            <button
              onClick={() => toggleLike()}
              className={cn("p-2", current.likeStatus === "LIKE" ? "text-foreground" : "text-muted-foreground")}
              aria-label="Like"
            >
              <Heart className={cn("w-5 h-5", current.likeStatus === "LIKE" && "fill-current")} />
            </button>

            <div className="relative">
              <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setSpeedOpen((v) => !v)}>
                <Gauge className="w-4 h-4" />
                <span className="text-xs font-bold tabular-nums">{speed.toFixed(2).replace(/\.?0+$/, "")}×</span>
              </Button>
              {speedOpen && (
                <div className="absolute bottom-11 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-popover shadow-xl p-2 flex gap-1 z-10">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      className={cn(
                        "px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums hover:bg-accent",
                        speed === s && "bg-foreground text-background"
                      )}
                      onClick={() => { setSpeed(s); setSpeedOpen(false); }}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1" />

            <button onClick={toggleMute} className="text-muted-foreground hover:text-foreground" aria-label={muted ? "Unmute" : "Mute"}>
              <VolumeIcon className="w-5 h-5" />
            </button>
            <Slider
              value={[muted ? 0 : Math.round(volume * 100)]}
              max={100}
              step={1}
              onValueChange={(v) => setVolume((v[0] || 0) / 100)}
              className="w-32"
              aria-label="Volume"
            />
          </div>
        </div>

        {/* right: panels */}
        <div className="min-h-0 lg:h-full lg:max-h-[calc(100vh-8rem)]">
          <Tabs defaultValue="queue" className="h-full flex flex-col">
            <TabsList className="self-center rounded-full">
              <TabsTrigger value="queue" className="rounded-full text-xs">Up next</TabsTrigger>
              <TabsTrigger value="lyrics" className="rounded-full text-xs">Lyrics</TabsTrigger>
              <TabsTrigger value="info" className="rounded-full text-xs">Info</TabsTrigger>
            </TabsList>
            <TabsContent value="queue" className="flex-1 min-h-0 data-[state=active]:flex">
              <QueuePanel embedded />
            </TabsContent>
            <TabsContent value="lyrics" className="flex-1 min-h-0">
              <LyricsPanel songId={current.videoId} position={position} />
            </TabsContent>
            <TabsContent value="info" className="flex-1 min-h-0 overflow-y-auto">
              <InfoPanel />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function LyricsPanel({ songId, position }: { songId: string; position: number }) {
  const { data: lyrics, isLoading } = useLyrics(songId);
  const activeRef = useRef<HTMLParagraphElement>(null);

  const activeIdx = useMemo(() => {
    if (!lyrics?.hasTimestamps || !Array.isArray(lyrics.lyrics)) return -1;
    const ms = position * 1000;
    return lyrics.lyrics.findIndex((l, i) => {
      const next = (lyrics.lyrics as { start_time: number }[])[i + 1];
      return ms >= l.start_time && (!next || ms < next.start_time);
    });
  }, [lyrics, position]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeIdx]);

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading lyrics…</div>;
  if (!lyrics) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-center p-8">
        <div className="font-display font-extrabold text-lg">Lyrics unavailable</div>
        <p className="text-sm text-muted-foreground">
          YouTube Music doesn&apos;t provide lyrics for this track right now.
        </p>
      </div>
    );
  }

  if (lyrics.hasTimestamps && Array.isArray(lyrics.lyrics)) {
    return (
      <div className="h-full overflow-y-auto py-6 pr-2">
        <div className="space-y-4 text-center">
          {(lyrics.lyrics as { id: number; start_time: number; text: string }[]).map((line, i) => (
            <p
              key={line.id}
              ref={i === activeIdx ? activeRef : undefined}
              className={cn(
                "font-display text-xl md:text-2xl font-extrabold transition-all duration-300 cursor-pointer",
                i === activeIdx ? "text-foreground scale-100" : "text-muted-foreground/50 hover:text-muted-foreground scale-[0.98]"
              )}
            >
              {line.text}
            </p>
          ))}
        </div>
        <div className="text-center text-[10px] text-muted-foreground mt-8">{lyrics.source}</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-6">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-center">{lyrics.lyrics as string}</pre>
      <div className="text-center text-[10px] text-muted-foreground mt-6">{lyrics.source}</div>
    </div>
  );
}

function InfoPanel() {
  const current = usePlayer((s) => s.current);
  if (!current) return null;
  const rows: [string, string | number][] = [
    ["Title", current.title],
    ["Artist", current.artistName],
    ["Album", current.albumTitle || "—"],
    ["Duration", formatTime(current.duration_seconds || 0)],
    ["Video ID", current.videoId],
  ];
  return (
    <div className="p-2">
      <div className="flex items-center gap-2 text-sm font-extrabold mb-3">
        <Info className="w-4 h-4" /> Track details
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-border/60 pb-1.5">
            <span className="text-muted-foreground shrink-0">{k}</span>
            <span className="font-bold tabular-nums truncate">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 text-xs text-muted-foreground leading-5">
        Streamed from YouTube Music via the YouTube IFrame Player. Recommendations combine YouTube&apos;s
        collaborative signals with your local listening history and the ranking formula.
      </div>
      <a
        className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold hover:underline"
        href={`https://www.youtube.com/watch?v=${current.videoId}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Youtube className="w-4 h-4" /> Open on YouTube
      </a>
    </div>
  );
}
