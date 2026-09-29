"use client";

/**
 * QueuePanel — up-next queue (spec: Up-next queue + reorder).
 * Drag & drop reorder (@dnd-kit), remove, jump to track, radio toggle,
 * and "Save queue as playlist".
 */
import { useState } from "react";
import { usePlayer } from "@/store/player-store";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { useCreatePlaylist } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { GripVertical, X, Radio, Save, ListMusic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Song } from "@/lib/types";

export function QueuePanel({ embedded = false, onClose }: { embedded?: boolean; onClose?: () => void }) {
  const {
    queue, index, jumpTo, removeFromQueue, reorderQueue, radio, toggleRadio,
    clearQueueUpNext, current,
  } = usePlayer();
  const [saveOpen, setSaveOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const create = useCreatePlaylist();
  const { toast } = useToast();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const upNext = queue.slice(index + 1);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = queue.findIndex((s) => s.videoId === active.id);
    const to = queue.findIndex((s) => s.videoId === over.id);
    if (from === index || to === index) return; // can't move the playing track
    reorderQueue(from, to);
    void arrayMove; // helper imported for clarity
  };

  const saveQueue = () => {
    if (!playlistName.trim()) return;
    create.mutate(
      { title: playlistName.trim(), videoIds: queue.map((s) => s.videoId), tracks: queue },
      {
        onSuccess: () => {
          toast({ title: "Queue saved as playlist", description: `"${playlistName.trim()}" · ${queue.length} songs` });
          setPlaylistName("");
          setSaveOpen(false);
          },
          onError: () => {
            toast({ title: "Couldn't save the queue", description: "Something went wrong — please try again." });
          },
        }
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-4 shrink-0">
        <div>
          <div className="font-display font-extrabold text-lg">Up next</div>
          <div className="text-xs text-muted-foreground">
            {current ? `Now: ${current.title}` : "Nothing playing"} · {upNext.length} queued
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={radio ? "default" : "outline"}
            size="sm"
            className="rounded-full gap-1.5"
            onClick={toggleRadio}
            title="Smart radio: keep the queue going with recommendations"
          >
            <Radio className="w-3.5 h-3.5" />
            Radio
          </Button>
          <Button variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => { setPlaylistName((v) => v || `Queue · ${new Date().toLocaleDateString()}`); setSaveOpen((v) => !v); }}>
            <Save className="w-3.5 h-3.5" /> Save
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="w-8 h-8" onClick={onClose} aria-label="Close queue">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {saveOpen && (
        <div className="px-4 pb-3 flex gap-2 shrink-0">
          <Input
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="Queue · name this playlist"
            onKeyDown={(e) => e.key === "Enter" && saveQueue()}
          />
          <Button onClick={saveQueue} disabled={!playlistName.trim() || create.isPending}>Save</Button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-4">
        {queue.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground text-sm">
            <ListMusic className="w-8 h-8" />
            Your queue is empty
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={queue.map((s) => s.videoId)} strategy={verticalListSortingStrategy}>
              <div className="space-y-0.5">
                {queue.map((song, i) => (
                  <QueueRow
                    key={`${song.videoId}-${i}`}
                    song={song}
                    isCurrent={i === index}
                    isPast={i < index}
                    onPlay={() => jumpTo(i)}
                    onRemove={() => removeFromQueue(i)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {upNext.length > 1 && (
        <div className="px-4 pb-4 shrink-0">
          <Button variant="ghost" size="sm" className="text-muted-foreground gap-1.5" onClick={clearQueueUpNext}>
            <Trash2 className="w-3.5 h-3.5" /> Clear up next
          </Button>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  song, isCurrent, isPast, onPlay, onRemove,
}: {
  song: Song;
  isCurrent: boolean;
  isPast: boolean;
  onPlay: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: song.videoId,
    disabled: isCurrent,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors",
        isCurrent && "bg-accent",
        isPast && "opacity-50",
        isDragging && "shadow-lg bg-accent z-10"
      )}
    >
      {!isCurrent && (
        <button
          className="text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          {...attributes}
          {...listeners}
          aria-label="Reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      {isCurrent && <span className="w-4" />}
      <img src={song.cover} alt="" className="w-9 h-9 rounded object-cover bw" />
      <button className="flex-1 min-w-0 text-left" onClick={onPlay}>
        <div className="text-sm font-bold truncate">{song.title}</div>
        <div className="text-xs text-muted-foreground truncate">{song.artistName}</div>
      </button>
      <span className="text-xs text-muted-foreground tabular-nums">{song.duration}</span>
      {!isCurrent && (
        <button
          className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
          onClick={onRemove}
          aria-label="Remove from queue"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
