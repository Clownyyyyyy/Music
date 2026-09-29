"use client";

import { usePlaylists, addToPlaylist } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Song } from "@/lib/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListMusic, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CreatePlaylistDialog } from "@/components/shared/CreatePlaylistDialog";
import { useState } from "react";

export function AddToPlaylistDialog({
  open, onOpenChange, song,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  song: Song;
}) {
  const { data: playlists } = usePlaylists();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const editable = (playlists || []).filter((p) => p.kind === "local");

  const addTo = async (playlistId: string, title: string) => {
    try {
      await addToPlaylist(playlistId, [song.videoId], [song]);
      setJustAdded(playlistId);
      qc.invalidateQueries({ queryKey: ["playlists"] });
      qc.invalidateQueries({ queryKey: ["playlist", playlistId] });
      toast({ title: "Added to playlist", description: `"${song.title}" → ${title}` });
      setTimeout(() => setJustAdded(null), 1500);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      toast({
        title: msg.includes("Duplicated") ? "Already in playlist" : "Could not add",
        description: msg.includes("Duplicated") ? `"${song.title}" is already in ${title}` : msg,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display font-extrabold">Add to playlist</DialogTitle>
          <DialogDescription className="truncate">"{song.title}" · {song.artistName}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72 -mx-2 px-2">
          <div className="space-y-1">
            <CreatePlaylistDialog>
              <button className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-bold hover:bg-accent transition-colors">
                <span className="w-9 h-9 rounded-md border border-border flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </span>
                New playlist
              </button>
            </CreatePlaylistDialog>
            {editable.map((p) => (
              <button
                key={p.playlistId}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-accent transition-colors text-left"
                onClick={() => addTo(p.playlistId, p.title)}
              >
                <img src={p.cover} alt="" className="w-9 h-9 rounded-md object-cover bw" />
                <span className="flex-1 min-w-0">
                  <span className="block font-bold truncate">{p.title}</span>
                  <span className="block text-xs text-muted-foreground">{p.count} songs</span>
                </span>
                {justAdded === p.playlistId && <Check className="w-4 h-4" />}
              </button>
            ))}
            {editable.length === 0 && (
              <div className="flex items-center gap-3 px-3 py-4 text-sm text-muted-foreground">
                <ListMusic className="w-4 h-4" /> No playlists yet — create one above.
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
