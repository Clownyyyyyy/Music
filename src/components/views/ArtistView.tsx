"use client";

/** Artist view — real channel (ytmusicapi.get_artist): songs, albums, singles, videos, related. */
import { useArtist } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import { AlbumCard, ArtistCard } from "@/components/shared/Cards";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Play, Shuffle, Radio, AlertCircle } from "lucide-react";
import { navigate } from "@/lib/router";

export function ArtistView({ id }: { id: string | undefined }) {
  const { data: artist, isLoading, isError } = useArtist(id || "");

  if (isLoading) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl space-y-6">
        <Skeleton className="h-44 rounded-xl" />
        <Skeleton className="h-10 w-56" />
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      </div>
    );
  }

  if (isError || !artist) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-6xl">
        <div className="rounded-xl border border-border p-8 text-center">
          <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
          <h1 className="font-display text-xl font-extrabold mt-3">Artist unavailable</h1>
          <p className="text-sm text-muted-foreground mt-1">Could not load this artist from YouTube Music.</p>
          <Button variant="outline" className="mt-4 rounded-full" onClick={() => navigate("/")}>Back home</Button>
        </div>
      </div>
    );
  }

  const play = (shuffle = false) => {
    const songs = artist.songs.results;
    if (songs.length === 0) return;
    usePlayer.getState().playList(songs, 0, "artist", { shuffle });
  };

  const radio = async () => {
    const seed = artist.songs.results[0]?.videoId;
    if (!seed) return;
    const res = await fetch(`/api/watch?videoId=${seed}&radio=true&limit=25`);
    const json = await res.json();
    usePlayer.getState().playList(json.tracks?.length ? json.tracks : artist.songs.results, 0, "radio", { radio: true });
  };

  const meta = [artist.subscribers, artist.monthlyListeners].filter(Boolean).join(" · ");

  return (
    <div className="max-w-6xl">
      <div className="px-4 md:px-8 pt-6 pb-5 border-b border-border bg-muted/30">
        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5">
          <img
            src={artist.avatar}
            alt={`${artist.title} portrait`}
            className="w-36 h-36 md:w-44 md:h-44 rounded-full object-cover shadow-xl bw"
          />
          <div className="min-w-0 text-center sm:text-left">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-bold">Artist</div>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight mt-1">{artist.title}</h1>
            {meta && <div className="text-xs text-muted-foreground mt-2">{meta}</div>}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-4">
              <Button className="rounded-full gap-1.5" onClick={() => play(false)} disabled={artist.songs.results.length === 0}>
                <Play className="w-4 h-4 fill-current" /> Play
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={() => play(true)} disabled={artist.songs.results.length === 0}>
                <Shuffle className="w-4 h-4" /> Shuffle
              </Button>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={radio} disabled={artist.songs.results.length === 0}>
                <Radio className="w-4 h-4" /> Radio
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-8">
        {artist.description && (
          <p className="text-sm text-muted-foreground leading-6 max-w-3xl line-clamp-4">{artist.description}</p>
        )}

        {artist.songs.results.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-extrabold mb-3">Songs</h2>
            <div className="space-y-0.5">
              {artist.songs.results.map((s, i) => <SongRow key={s.videoId} song={s} index={i} />)}
            </div>
          </section>
        )}

        {artist.albums.results.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-extrabold mb-3">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
              {artist.albums.results.map((a) => <AlbumCard key={a.browseId} album={a} />)}
            </div>
          </section>
        )}

        {artist.singles.results.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-extrabold mb-3">Singles</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
              {artist.singles.results.slice(0, 10).map((a) => <AlbumCard key={a.browseId} album={a} />)}
            </div>
          </section>
        )}

        {artist.videos.results.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-extrabold mb-3">Videos</h2>
            <div className="space-y-0.5">
              {artist.videos.results.slice(0, 5).map((s, i) => (
                <SongRow key={s.videoId} song={s} index={i} showAlbum={false} showViews />
              ))}
            </div>
          </section>
        )}

        {artist.related.results.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-extrabold mb-3">Fans might also like</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
              {artist.related.results.map((a) => <ArtistCard key={a.browseId} artist={a} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
