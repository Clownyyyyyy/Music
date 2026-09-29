"use client";

/**
 * AppShell — the application frame: sidebar (desktop) / bottom nav (mobile),
 * top bar with global search + theme toggle, the persistent player bars,
 * keyboard shortcuts and session restore.
 */
import { useEffect, useState } from "react";
import { useRoute, navigate, goBack } from "@/lib/router";
import { usePlayer } from "@/store/player-store";
import { useSettings } from "@/store/settings-store";
import { usePlaylists } from "@/lib/api";
import { audioEngine } from "@/player/yt-engine";
import { Sidebar } from "@/components/shared/Sidebar";
import { TopBar } from "@/components/shared/TopBar";
import { MobileNav } from "@/components/shared/MobileNav";
import { PlayerBar } from "@/components/player/PlayerBar";
import { NowPlaying } from "@/components/player/NowPlaying";
import { QueuePanel } from "@/components/player/QueuePanel";
import { ShortcutsDialog } from "@/components/shared/ShortcutsDialog";
import { InstallPrompt } from "@/components/shared/InstallPrompt";
import { HomeView } from "@/components/views/HomeView";
import { SearchView } from "@/components/views/SearchView";
import { LibraryView } from "@/components/views/LibraryView";
import { ExploreView } from "@/components/views/ExploreView";
import { AlbumView } from "@/components/views/AlbumView";
import { ArtistView } from "@/components/views/ArtistView";
import { PlaylistView } from "@/components/views/PlaylistView";
import { HistoryView } from "@/components/views/HistoryView";
import { SettingsView } from "@/components/views/SettingsView";
import { MoodsView } from "@/components/views/MoodsView";
import { LikedView } from "@/components/views/LikedView";

function View() {
  const route = useRoute();
  const [s0, s1, s2] = route.segments;

  switch (s0) {
    case undefined:
    case "":
      return <HomeView />;
    case "search":
      return <SearchView />;
    case "library":
      return <LibraryView tab={s1 || "playlists"} />;
    case "explore":
      return <ExploreView />;
    case "moods":
      return <MoodsView params={s1 ? decodeURIComponent(s1) : ""} />;
    case "album":
      return <AlbumView id={s1} />;
    case "artist":
      return <ArtistView id={s1} />;
    case "playlist":
      return s1 === "LIKED" ? <LikedView /> : <PlaylistView id={s1} />;
    case "history":
      return <HistoryView />;
    case "settings":
      return <SettingsView />;
    default:
      return <HomeView />;
  }
}

export function AppShell() {
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const route = useRoute();
  const { init, restoreSession, current } = usePlayer();
  const hydrateSettings = useSettings((s) => s.hydrate);
  const theme = useSettings((s) => s.theme);
  const { data: playlists } = usePlaylists();

  // boot: settings + persistent player + previous session
  useEffect(() => {
    hydrateSettings().then(() => {
      init();
      restoreSession();
    });
  }, []);

  // theme application (spec: dark/light)
  useEffect(() => {
    const apply = () => {
      const dark =
        theme === "dark" ||
        (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      try {
        localStorage.setItem("bw-theme", theme);
      } catch { /* noop */ }
    };
    apply();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // service worker registration (PWA)
  // updateViaCache:"none" — the sw.js file itself must never come from the
  // HTTP cache, otherwise browsers keep running a dead SW and never see fixes.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        .catch(() => {});
    }
  }, []);

  // keyboard shortcuts (spec: ⌨️ Keyboard shortcuts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA"].includes(target?.tagName) || target?.isContentEditable;
      if (typing) return;
      const p = usePlayer.getState();
      switch (e.key) {
        case " ":
          e.preventDefault();
          if (p.current) p.toggle();
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) p.next(true);
          else p.seekByDelta(5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) p.prev();
          else p.seekByDelta(-5);
          break;
        case "ArrowUp":
          e.preventDefault();
          p.setVolume(Math.min(1, p.volume + 0.05));
          break;
        case "ArrowDown":
          e.preventDefault();
          p.setVolume(Math.max(0, p.volume - 0.05));
          break;
        case "m": case "M":
          p.toggleMute();
          break;
        case "s": case "S":
          p.toggleShuffle();
          break;
        case "r": case "R":
          p.cycleRepeat();
          break;
        case "l": case "L":
          p.toggleLike();
          break;
        case "n": case "N":
          setNowPlayingOpen((v) => !v);
          break;
        case "q": case "Q":
          setQueueOpen((v) => !v);
          break;
        case "?":
          setShortcutsOpen(true);
          break;
        case "/":
          e.preventDefault();
          navigate("/search");
          break;
        case "Escape":
          setNowPlayingOpen(false);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const closeNowPlaying = () => {
    setNowPlayingOpen(false);
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar playlists={playlists} />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar
          onOpenShortcuts={() => setShortcutsOpen(true)}
          activeSearch={route.segments[0] === "search"}
        />
        <main className="flex-1 pb-40 md:pb-28">
          <View />
        </main>
      </div>

      <PlayerBar
        onExpand={() => setNowPlayingOpen(true)}
        onToggleQueue={() => setQueueOpen((v) => !v)}
        queueOpen={queueOpen}
        onCloseQueue={() => setQueueOpen(false)}
      />
      <MobileNav />
      {nowPlayingOpen && <NowPlaying onClose={closeNowPlaying} />}
      {queueOpen && !nowPlayingOpen && (
        <div className="fixed inset-0 z-40 flex justify-end" onClick={() => setQueueOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative h-full w-full max-w-md bg-background border-l border-border shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <QueuePanel onClose={() => setQueueOpen(false)} />
          </div>
        </div>
      )}
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <InstallPrompt />
      {current === null && <BootHint />}
    </div>
  );
}

function BootHint() {
  return (
    <div className="fixed bottom-28 md:bottom-20 left-1/2 -translate-x-1/2 z-30 px-3">
      <div className="rounded-full bg-foreground text-background text-xs px-3 py-1.5 shadow-lg">
        Pick a song to start listening
      </div>
    </div>
  );
}
