"use client";

/**
 * Search — ytmusicapi-style search with real filter chips:
 * All · Songs · Videos · Albums · Artists · Playlists · Community · Featured.
 * Every result comes live from YouTube Music.
 */
import { useState } from "react";
import { useRoute, navigate } from "@/lib/router";
import { useSearch, useSuggestions, type SearchResponse } from "@/lib/api";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import { AlbumCard, ArtistCard, PlaylistCard } from "@/components/shared/Cards";
import type { Album, Artist, PlaylistSummary, Song } from "@/lib/types";
import { Search as SearchIcon, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS = [
  { id: "", label: "All" },
  { id: "songs", label: "Songs" },
  { id: "videos", label: "Videos" },
  { id: "albums", label: "Albums" },
  { id: "artists", label: "Artists" },
  { id: "playlists", label: "Playlists" },
  { id: "community_playlists", label: "Community" },
  { id: "featured_playlists", label: "Featured" },
];

export function SearchView() {
  const route = useRoute();
  const initialQ = route.query.get("q") || "";
  const [override, setOverride] = useState<string | null>(null);
  const input = override ?? initialQ;
  const setInput = setOverride;
  const [filter, setFilter] = useState("");
  const { data, isFetching, isError } = useSearch(initialQ, filter);
  const { data: suggestions } = useSuggestions(input);

  const res = data as SearchResponse | undefined;
  const hasResults = !!res && ((res.songs?.length ?? 0) + (res.videos?.length ?? 0) + (res.albums?.length ?? 0) + (res.artists?.length ?? 0) + (res.playlists?.length ?? 0) > 0);

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl space-y-5">
      <div className="relative md:hidden">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && input.trim()) { navigate(`/search?q=${encodeURIComponent(input.trim())}`); setOverride(null); } }}
          placeholder="Search YouTube Music…"
          className="w-full h-11 rounded-full border border-input bg-muted/50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        {suggestions && suggestions.length > 0 && input !== initialQ && (
          <div className="absolute inset-x-0 top-12 rounded-xl border border-border bg-popover shadow-xl z-10 overflow-hidden">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={s}
                className="block w-full text-left px-4 py-2.5 text-sm hover:bg-accent"
                onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {!initialQ ? (
        <div className="py-16 text-center">
          <SearchIcon className="w-10 h-10 mx-auto text-muted-foreground/50" />
          <h1 className="font-display text-2xl font-extrabold mt-3">Search YouTube Music</h1>
          <p className="text-sm text-muted-foreground mt-1">Songs, videos, albums, artists, playlists — the real catalog.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={cn(
                  "px-3.5 py-1.5 rounded-full text-xs font-bold transition-colors",
                  filter === f.id ? "bg-foreground text-background" : "border border-border hover:bg-accent"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {isFetching && <div className="text-sm text-muted-foreground">Searching YouTube Music…</div>}
          {isError && <div className="text-sm text-destructive">Search failed — check that the yt-service is running.</div>}

          {res && !hasResults && !isFetching && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No results for “{initialQ}”. Try a different spelling or fewer words.
            </div>
          )}

          {res && (
            <div className="space-y-6">
              {!filter && res.top && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Top result</h2>
                  {(() => {
                    const top = res.top;
                    if ("videoId" in top) {
                      return (
                        <button
                          className="group w-full flex items-center gap-4 rounded-xl border border-border p-4 hover:bg-accent transition-colors text-left"
                          onClick={() => usePlayer.getState().playNow(top as Song, "search")}
                        >
                          <img src={(top as Song).cover} alt="" className="w-16 h-16 rounded-lg object-cover bw" />
                          <div className="min-w-0 flex-1">
                            <div className="font-display text-lg font-extrabold truncate">{top.title}</div>
                            <div className="text-sm text-muted-foreground truncate">
                              Song · {(top as Song).artistName}
                              {(top as Song).albumTitle ? ` · ${(top as Song).albumTitle}` : ""}
                            </div>
                          </div>
                          <span className="w-11 h-11 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                            <Play className="w-5 h-5 fill-current" />
                          </span>
                        </button>
                      );
                    }
                    if ("browseId" in top && "avatar" in (top as Artist)) {
                      return <div className="max-w-xs"><ArtistCard artist={top as Artist} /></div>;
                    }
                    if ("browseId" in top) {
                      return <div className="max-w-xs"><AlbumCard album={top as Album} /></div>;
                    }
                    if ("playlistId" in top) {
                      return <div className="max-w-xs"><PlaylistCard playlist={top as PlaylistSummary} /></div>;
                    }
                    return null;
                  })()}
                </section>
              )}

              {(res.songs.length > 0 || (filter === "songs" && res.top && "videoId" in res.top)) && (filter === "" || filter === "songs") && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1.5">Songs</h2>
                  <div className="space-y-0.5">
                    {(res.songs.length ? res.songs : filter === "songs" && res.top && "videoId" in res.top ? [res.top as Song] : []).slice(0, 15).map((s, i) => (
                      <SongRow key={s.videoId} song={s} index={i} />
                    ))}
                  </div>
                </section>
              )}

              {res.videos.length > 0 && (filter === "" || filter === "videos") && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-1.5">Videos</h2>
                  <div className="space-y-0.5">
                    {res.videos.slice(0, filter === "videos" ? 15 : 6).map((s, i) => (
                      <SongRow key={s.videoId} song={s} index={i} showAlbum={false} showViews />
                    ))}
                  </div>
                </section>
              )}

              {res.albums.length > 0 && (filter === "" || filter === "albums") && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Albums &amp; singles</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
                    {res.albums.slice(0, filter === "albums" ? 18 : 6).map((a) => <AlbumCard key={a.browseId} album={a} />)}
                  </div>
                </section>
              )}

              {res.artists.length > 0 && (filter === "" || filter === "artists") && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Artists</h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
                    {res.artists.slice(0, filter === "artists" ? 18 : 6).map((a) => <ArtistCard key={a.browseId} artist={a} />)}
                  </div>
                </section>
              )}

              {res.playlists.length > 0 && (filter === "" || ["playlists", "community_playlists", "featured_playlists"].includes(filter)) && (
                <section>
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">
                    {filter === "community_playlists" ? "Community playlists" : filter === "featured_playlists" ? "Featured playlists" : "Playlists"}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1">
                    {res.playlists.slice(0, filter === "" ? 6 : 18).map((p) => <PlaylistCard key={p.playlistId} playlist={p} />)}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
