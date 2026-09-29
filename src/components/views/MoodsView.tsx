"use client";

/** Moods — real playlists for a mood/genre category (get_moods_playlists). */
import { useMoodPlaylists, useMoodCategories } from "@/lib/api";
import { PlaylistCard } from "@/components/shared/Cards";
import { navigate, useRoute } from "@/lib/router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function MoodsView({ params }: { params: string }) {
  const route = useRoute();
  const { data: categories } = useMoodCategories();
  const { data: playlists, isLoading } = useMoodPlaylists(params);

  const queryTitle = route.query.get("title");
  const title =
    queryTitle ||
    categories?.sections.flatMap((s) => s.categories).find((c) => c.params === params)?.title ||
    "Moods & genres";

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/explore")} aria-label="Back to explore">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="font-display text-2xl md:text-3xl font-extrabold">{title}</h1>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
          {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : (playlists || []).length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">No playlists found for this mood.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1">
          {(playlists || []).map((p) => <PlaylistCard key={p.playlistId} playlist={p} />)}
        </div>
      )}
    </div>
  );
}
