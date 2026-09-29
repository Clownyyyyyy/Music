"use client";

/** Explore — real Moods & Genres (get_mood_categories) + Charts (get_charts) + recommendations. */
import { useState } from "react";
import { useMoodCategories, useCharts, useRecommendations } from "@/lib/api";
import { navigate } from "@/lib/router";
import { usePlayer } from "@/store/player-store";
import { SongRow } from "@/components/shared/SongRow";
import type { ChartSong, Song } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrendingUp, Sparkles, Info, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

export function ExploreView() {
  const { data: categories } = useMoodCategories();
  const [country, setCountry] = useState("ZZ");
  const { data: charts } = useCharts(country);
  const { data: recs } = useRecommendations("", 12);

  // chart songs already carry full metadata — map straight to playable Songs
  const chartToSong = (s: ChartSong): Song => ({
    videoId: s.videoId,
    title: s.title,
    artists: s.artists,
    artistName: s.artists[0]?.name || "Unknown artist",
    album: null, albumId: "", albumTitle: "",
    duration: "", duration_seconds: 0,
    thumbnails: s.thumbnails, cover: s.cover,
    views: s.views,
  });

  const playChart = (songs: ChartSong[], startIdx = 0) => {
    const list = songs.map(chartToSong);
    if (list.length) usePlayer.getState().playList(list, startIdx, "charts");
  };

  const countries = charts?.countries.options || ["ZZ"];
  const selected = charts?.countries.selected;
  const selectedCode = typeof selected === "string" ? selected : country;

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl space-y-8">
      <header>
        <h1 className="font-display text-2xl md:text-3xl font-extrabold">Explore</h1>
        <p className="text-sm text-muted-foreground mt-1">Moods, genres, charts and your personal mix — live from YouTube Music.</p>
      </header>

      {/* Recommended — spec ranking formula over real signals */}
      {recs && recs.tracks.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg font-extrabold flex items-center gap-2">
              <Sparkles className="w-[18px] h-[18px]" /> Recommended for you
            </h2>
            <RecommendationInfo weights={recs.context.weights} timeOfDay={recs.context.timeOfDay} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6">
            <div className="space-y-0.5">
              {recs.tracks.slice(0, 5).map((t, i) => (
                <SongRow key={t.videoId} song={t} index={i} showAlbum={false} />
              ))}
            </div>
            <div className="space-y-0.5">
              {recs.tracks.slice(5, 10).map((t, i) => (
                <SongRow key={t.videoId} song={t} index={i + 5} showAlbum={false} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Moods & genres */}
      {categories?.sections.map((section) => (
        <section key={section.title}>
          <h2 className="font-display text-lg font-extrabold mb-3">{section.title}</h2>
          <div className="flex flex-wrap gap-2">
            {section.categories.map((cat) => (
              <button
                key={cat.params}
                onClick={() => navigate(`/moods/${encodeURIComponent(cat.params)}?title=${encodeURIComponent(cat.title)}`)}
                className="px-4 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-accent transition-colors"
              >
                {cat.title}
              </button>
            ))}
          </div>
        </section>
      ))}

      {/* Charts */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg font-extrabold flex items-center gap-2">
            <TrendingUp className="w-[18px] h-[18px]" /> Charts
          </h2>
          <select
            value={selectedCode || country}
            onChange={(e) => setCountry(e.target.value)}
            className="h-8 rounded-full border border-border bg-background px-3 text-xs font-bold"
            aria-label="Chart country"
          >
            {countries.map((c) => (
              <option key={c} value={c}>{c === "ZZ" ? "Global" : c}</option>
            ))}
          </select>
        </div>

        {charts && charts.songs.length === 0 && charts.artists.length === 0 && (
          <div className="rounded-xl border border-border p-6 text-center text-sm text-muted-foreground">
            Charts are unavailable right now — YouTube is rate-limiting this endpoint. They will appear
            automatically once data is fetched; everything else keeps working.
          </div>
        )}

        {charts && (charts.songs.length > 0 || charts.artists.length > 0) && (
          <div className="grid lg:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Top songs</h3>
                <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => playChart(charts.songs)}>
                  <Play className="w-3.5 h-3.5 fill-current" /> Play chart
                </Button>
              </div>
              <div className="space-y-0.5">
                {charts.songs.slice(0, 10).map((s, i) => (
                  <button
                    key={s.videoId}
                    className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors text-left"
                    onClick={() => playChart(charts.songs.slice(0, 10), i)}
                  >
                    <span className="w-6 text-center font-display font-extrabold text-sm tabular-nums">{s.rank}</span>
                    <img src={s.cover} alt="" className="w-10 h-10 rounded object-cover bw" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-bold truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.artists.map((a) => a.name).join(", ")}</div>
                    </div>
                    <Trend t={s.trend} />
                    <span className="text-xs text-muted-foreground tabular-nums w-14 text-right truncate">{s.views}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground mb-3">Top artists</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                {charts.artists.slice(0, 9).map((a) => (
                  <button
                    key={a.browseId}
                    className="rounded-xl p-3 hover:bg-accent transition-colors text-left"
                    onClick={() => navigate(`/artist/${a.browseId}`)}
                  >
                    <img src={a.avatar || a.thumbnails[0]?.url} alt="" className="aspect-square w-full rounded-full object-cover bw mb-2" loading="lazy" />
                    <div className="text-sm font-bold truncate">{a.title}</div>
                    <div className="text-xs text-muted-foreground truncate">#{a.rank}{a.subscribers ? ` · ${a.subscribers}` : ""}</div>
                  </button>
                ))}
              </div>
              {charts.genres && charts.genres.length > 0 && (
                <div className="mt-5 space-y-2">
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Genres</h3>
                  {charts.genres.map((g) => (
                    <button
                      key={g.playlistId}
                      className="w-full rounded-xl border border-border px-4 py-3 text-left text-sm font-bold hover:bg-accent transition-colors"
                      onClick={() => navigate(`/playlist/${g.playlistId}`)}
                    >
                      {g.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Trend({ t }: { t: "up" | "down" | "neutral" }) {
  return (
    <span className={cn("text-[10px] font-black w-4 text-center", t === "up" && "text-foreground", t === "down" && "text-muted-foreground/40 rotate-180")}>
      {t === "neutral" ? "•" : "▲"}
    </span>
  );
}

function RecommendationInfo({ weights, timeOfDay }: { weights: Record<string, number>; timeOfDay: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <Info className="w-3.5 h-3.5" /> How this works
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-extrabold">The ranking formula</DialogTitle>
          <DialogDescription>
            Candidates are scored right now ({timeOfDay} context) — higher is better.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm">
          {Object.entries(weights).map(([k, w]) => (
            <div key={k} className="flex items-center gap-3">
              <span className="w-40 text-muted-foreground capitalize">{k.replace("_", " ")}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-foreground rounded-full" style={{ width: `${w * 200}%` }} />
              </div>
              <span className="tabular-nums font-bold w-10 text-right">{w.toFixed(2)}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground leading-5">
          Candidates come from YouTube Music radio lists around your seeds (collaborative signal),
          your learned transitions (sequence), chart popularity and freshness. Skips and completions
          continuously update the model via the feedback loop.
        </p>
      </DialogContent>
    </Dialog>
  );
}
