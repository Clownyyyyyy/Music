"use client";

/** Media cards (album / artist / playlist) for grids and rails. */
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Play } from "lucide-react";
import { usePlayer } from "@/store/player-store";
import type { Album, Artist, PlaylistSummary, Song } from "@/lib/types";

export function AlbumCard({ album }: { album: Album }) {
  const playAlbum = async () => {
    // real albums carry their audio playlistId from ytmusicapi
    if (album.playlistId) {
      const res = await fetch(`/api/watch?playlistId=${album.playlistId}&limit=100`);
      const json = await res.json();
      const tracks: Song[] = json.tracks || [];
      if (tracks.length) {
        usePlayer.getState().playList(tracks, 0, "album");
        return;
      }
    }
    navigate(`/album/${album.browseId}`);
  };
  return (
    <button
      className="group text-left rounded-xl p-3 hover:bg-accent transition-colors w-full"
      onClick={() => navigate(`/album/${album.browseId}`)}
    >
      <div className="relative mb-3">
        <img src={album.cover} alt={`${album.title} cover`} className="aspect-square w-full rounded-lg object-cover bw" loading="lazy" />
        <PlayButton onClick={playAlbum} />
      </div>
      <div className="font-bold text-sm truncate">{album.title}</div>
      <div className="text-xs text-muted-foreground truncate">
        {album.year ? `${album.year} · ` : ""}{album.artistName}
      </div>
    </button>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <button
      className="group text-left rounded-xl p-3 hover:bg-accent transition-colors w-full"
      onClick={() => navigate(`/artist/${artist.browseId}`)}
    >
      <div className="relative mb-3">
        <img
          src={artist.avatar}
          alt={`${artist.title} portrait`}
          className="aspect-square w-full rounded-full object-cover bw"
          loading="lazy"
        />
      </div>
      <div className="font-bold text-sm truncate">{artist.title}</div>
      <div className="text-xs text-muted-foreground truncate">{artist.subscribers || "Artist"}</div>
    </button>
  );
}

export function PlaylistCard({ playlist }: { playlist: PlaylistSummary }) {
  const play = async () => {
    if (playlist.kind === "local") {
      navigate(`/playlist/${playlist.playlistId}`);
      return;
    }
    const res = await fetch(`/api/watch?playlistId=${playlist.playlistId}&limit=50`);
    const json = await res.json();
    const tracks: Song[] = json.tracks || [];
    if (tracks.length) usePlayer.getState().playList(tracks, 0, "playlist");
    else navigate(`/playlist/${playlist.playlistId}`);
  };
  return (
    <button
      className="group text-left rounded-xl p-3 hover:bg-accent transition-colors w-full"
      onClick={() => navigate(`/playlist/${playlist.playlistId}`)}
    >
      <div className="relative mb-3">
        <img src={playlist.cover} alt={`${playlist.title} cover`} className="aspect-square w-full rounded-lg object-cover bw" loading="lazy" />
        <PlayButton onClick={play} />
      </div>
      <div className="font-bold text-sm truncate">{playlist.title}</div>
      <div className="text-xs text-muted-foreground truncate">{playlist.subtitle || playlist.description || `${playlist.count ?? ""} songs`}</div>
    </button>
  );
}

export function PlayButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <span
      role="button"
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClick(); } }}
      className={cn(
        "absolute bottom-2 right-2 w-11 h-11 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 focus:opacity-100 transition-all",
        className
      )}
      aria-label="Play"
    >
      <Play className="w-5 h-5 fill-current" />
    </span>
  );
}
