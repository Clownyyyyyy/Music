"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePlaylist } from "@/lib/api";

export function CreatePlaylistDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreatePlaylist();

  const submit = () => {
    if (!title.trim()) return;
    create.mutate(
      { title: title.trim(), description: description.trim() },
      {
        onSuccess: () => {
          setOpen(false);
          setTitle("");
          setDescription("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-extrabold">New playlist</DialogTitle>
          <DialogDescription>Give your playlist a name and a vibe.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pl-title">Title</Label>
            <Input id="pl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Late night coding" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pl-desc">Description</Label>
            <Textarea id="pl-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!title.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
