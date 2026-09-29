"use client";

/** History — grouped by day (get_history), remove items, clear all. */
import { useHistory, useRemoveHistoryItems, useClearHistory } from "@/lib/api";
import { SongRow } from "@/components/shared/SongRow";
import { relativeDay, formatClockTime } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import type { Song } from "@/lib/types";

export function HistoryView() {
  const { data: days, isLoading } = useHistory();
  const removeItems = useRemoveHistoryItems();
  const clear = useClearHistory();

  if (isLoading) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-4xl space-y-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-extrabold">History</h1>
          <p className="text-sm text-muted-foreground mt-1">Everything you have listened to, newest first.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="rounded-full gap-1.5" disabled={!days?.length}>
              <Trash2 className="w-3.5 h-3.5" /> Clear history
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear listening history?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes all history entries. Recommendations will forget your recent sessions.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => clear.mutate()}>Clear all</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {days?.length === 0 && (
        <div className="py-16 text-center text-sm text-muted-foreground">Nothing here yet — play something.</div>
      )}

      {days?.map((day) => (
        <section key={day.date}>
          <h2 className="font-display text-lg font-extrabold mb-2">{relativeDay(day.entries[0].played)}</h2>
          <div className="space-y-0.5">
            {day.entries.map((entry) => {
              const { id, played, percentPlayed, context, ...song } = entry as Song & {
                id: string; played: string; percentPlayed: number; context: string;
              };
              void played; void context;
              return (
                <div key={id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <SongRow song={song} />
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums w-16 text-right shrink-0 hidden sm:block">
                    {formatClockTime(entry.played)}
                  </span>
                  <button
                    className="p-1.5 text-muted-foreground/60 hover:text-foreground shrink-0"
                    onClick={() => removeItems.mutate([id])}
                    aria-label="Remove from history"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
