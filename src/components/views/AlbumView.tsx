"use client";

/** Album view — real album (browseId) with header, actions and track list. */
import { useAlbum } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import { formatLongDuration } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Play, Shuffle, Radio, Disc3, AlertCircle } from "lucide-react";
import { navigate } from "@/lib/router";

export function AlbumView({ id }: { id: string | undefined }) {
  const { data: album, isLoading, isError } = useAlbum(id || "");

  if (isLoading) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl space-y-6">
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-10 w-72" />
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </div>
    );
  }

  if (isError || !album) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl">
        <div className="rounded-xl border border-border p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
          <h1 className="font-display text-xl font-extrabold mt-3">Album unavailable</h1>
          <p className="text-sm text-muted-foreground mt-1">Could not load this album from YouTube Music.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate("/")}>Back home</Button>
        </div>
      </div>
    );
  }

  const play = (shuffle = false) => {
    usePlayer.getState().playList(album.tracks, 0, "album", { shuffle });
  };

  const radio = async () => {
    if (!album.tracks[0]) return;
    const res = await fetch(`/api/watch?videoId=${album.tracks[0].videoId}&radio=true&limit=25`);
    const json = await res.json();
    const tracks = json.tracks || [];
    usePlayer.getState().playList(tracks.length ? tracks : album.tracks, 0, "radio", { radio: true });
  };

  const artistId = album.artists?.[0]?.id;

  return (
    <div className="max-w-6xl">
      {/* pure monochrome header */}
      <div className="px-4 md:px-8 pt-6 pb-5 border-b border-border bg-muted/30">
        <div className="flex flex-col sm:flex-row gap-5">
          <img
            src={album.cover}
            alt={`${album.title} cover`}
            className="w-40 h-40 md:w-52 md:h-52 rounded-xl object-cover shadow-xl bw mx-auto sm:mx-0"
          />
          <div className="flex flex-col justify-end min-w-0 text-center sm:text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-bold flex items-center gap-1.5 justify-center sm:justify-start">
              <Disc3 className="w-3.5 h-3.5" /> {album.type || "Album"}
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">{album.title}</h1>
            {artistId ? (
              <button
                className="text-sm font-bold mt-2 hover:underline"
                onClick={() => navigate(`/artist/${artistId}`)}
              >
                {album.artistName}
              </button>
            ) : (
              <div className="text-sm font-bold mt-2">{album.artistName}</div>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              {[album.year, `${album.trackCount} songs`, formatLongDuration(album.duration_seconds || 0)]
                .filter(Boolean).join(" · ")}
            </div>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
              <Button className="rounded-full gap-1.5" onClick={() => play(false)}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={() => play(true)}>
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={radio}>
                <Radio className="w-4 h-4" /> Radio
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-4">
        <div className="space-y-0.5">
          {album.tracks.map((t, i) => (
            <SongRow key={`${t.videoId}-${i}`} song={t} index={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
