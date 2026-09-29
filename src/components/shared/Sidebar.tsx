"use client";

import { navigate, useRoute } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Home, Compass, Library, History, Settings, Plus, ListMusic, Heart,
  type LucideIcon,
} from "lucide-react";
import { usePlayer } from "@/store/player-store";
import type { PlaylistSummary } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { CreatePlaylistDialog } from "@/components/shared/CreatePlaylistDialog";

const NAV: { icon: LucideIcon; label: string; path: string }[] = [
  { icon: Home, label: "Home", path: "/" },
  { icon: Compass, label: "Explore", path: "/explore" },
  { icon: Library, label: "Library", path: "/library" },
  { icon: History, label: "History", path: "/history" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export function Sidebar({ playlists }: { playlists?: PlaylistSummary[] }) {
  const route = useRoute();
  const current = usePlayer((s) => s.current);
  const isActive = (path: string) => {
    if (path === "/") return route.path === "";
    const p = path.replace(/^\//, "");
    return route.path === p || route.path.startsWith(`${p}/`);
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar sticky top-0 h-screen">
      <button
        className="flex items-center gap-2.5 px-5 pt-6 pb-5 text-left"
        onClick={() => navigate("/")}
        aria-label="B&W Music home"
      >
        <img src="/icons/icon-192.png" alt="" className="w-8 h-8 rounded-lg bw" />
        <div>
          <div className="font-display font-extrabold text-lg leading-none tracking-tight">B&amp;W Music</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">Just music</div>
        </div>
      </button>

      <nav className="px-3 space-y-0.5" aria-label="Primary">
        {NAV.map(({ icon: Icon, label, path }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className={cn(
              "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
              isActive(path)
                ? "bg-foreground text-background"
                : "text-foreground/80 hover:bg-accent"
            )}
            aria-current={isActive(path) ? "page" : undefined}
          >
            <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-6 px-3 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-2 pb-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Playlists</span>
          <CreatePlaylistDialog>
            <Button variant="ghost" size="icon" className="w-6 h-6" aria-label="Create playlist">
              <Plus className="w-4 h-4" />
            </Button>
          </CreatePlaylistDialog>
        </div>
        <div className="space-y-0.5 pb-6">
          <PlaylistLink
            icon={<Heart className="w-4 h-4" />}
            label="Liked songs"
            active={route.path === "playlist/LIKED"}
            onClick={() => navigate("/playlist/LIKED")}
          />
          {playlists
            ?.filter((p) => p.kind === "local")
            .map((p) => (
              <PlaylistLink
                key={p.playlistId}
                icon={<ListMusic className="w-4 h-4" />}
                label={p.title}
                active={route.path === `playlist/${p.playlistId}`}
                onClick={() => navigate(`/playlist/${p.playlistId}`)}
              />
            ))}
        </div>
      </div>

      {current && (
        <button
          className="mx-3 mb-4 rounded-lg border border-border px-3 py-2 text-left hover:bg-accent transition-colors"
          onClick={() => current.albumId && navigate(`/album/${current.albumId}`)}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Now playing</div>
          <div className="text-sm font-bold truncate">{current.albumTitle || current.artistName}</div>
        </button>
      )}
    </aside>
  );
}

function PlaylistLink({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-accent font-bold" : "text-foreground/70 hover:bg-accent/60"
      )}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}
