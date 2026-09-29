"use client";

import { useState } from "react";
import { useRoute, navigate, goBack } from "@/lib/router";
import { Moon, Sun, Search, ArrowLeft, Keyboard, Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/store/settings-store";

export function TopBar({ onOpenShortcuts, activeSearch }: { onOpenShortcuts: () => void; activeSearch?: boolean }) {
  const route = useRoute();
  const routeQ = route.query.get("q") || "";
  const [override, setOverride] = useState<string | null>(null);
  const q = override ?? routeQ;
  const setQ = setOverride;
  const theme = useSettings((s) => s.theme);
  const setSetting = useSettings((s) => s.set);

  const submit = (value: string) => {
    if (value.trim()) navigate(`/search?q=${encodeURIComponent(value.trim())}`);
    setOverride(null);
  };

  const cycleTheme = () => {
    const order = ["system", "light", "dark"] as const;
    const next = order[(order.indexOf(theme as "system") + 1) % 3];
    setSetting("theme", next);
  };

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 px-4 md:px-6 h-16 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <Button variant="ghost" size="icon" className="md:hidden -ml-2" onClick={goBack} aria-label="Back">
        <ArrowLeft className="w-5 h-5" />
      </Button>

      <form
        className="flex-1 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          submit(q);
        }}
        role="search"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search songs, artists, albums…"
            className="w-full h-10 rounded-full border border-input bg-muted/50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring focus:bg-background transition-all"
            aria-label="Search"
          />
        </div>
      </form>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onOpenShortcuts} aria-label="Keyboard shortcuts" className="hidden sm:inline-flex">
          <Keyboard className="w-5 h-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}`}
          title={`Theme: ${theme}`}
        >
          {theme === "dark" ? (
            <Moon className="w-5 h-5" />
          ) : theme === "light" ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Command className="w-5 h-5" />
          )}
        </Button>
      </div>
    </header>
  );
}
