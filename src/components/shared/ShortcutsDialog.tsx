"use client";

import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Playback",
    items: [
      ["Space", "Play / pause"],
      ["→ / ←", "Seek 5s"],
      ["Shift + → / ←", "Next / previous track"],
      ["↑ / ↓", "Volume up / down"],
      ["M", "Mute / unmute"],
    ],
  },
  {
    title: "Modes",
    items: [
      ["S", "Shuffle"],
      ["R", "Repeat: off → all → one"],
      ["L", "Like current song"],
      ["N", "Open / close Now Playing"],
      ["Q", "Toggle queue"],
    ],
  },
  {
    title: "Navigation",
    items: [
      ["/", "Focus search"],
      ["?", "This dialog"],
      ["Esc", "Close overlays"],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-extrabold">Keyboard shortcuts</DialogTitle>
          <DialogDescription>Drive the whole player without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="grid sm:grid-cols-3 gap-5">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{g.title}</div>
              <div className="space-y-1.5">
                {g.items.map(([k, label]) => (
                  <div key={k} className="flex items-center justify-between gap-2 text-sm">
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-bold">{k}</kbd>
                    <span className="text-muted-foreground text-right">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
