/**
 * QueueManager — up-next queue state and operations (spec: 📋 Up-next queue,
 * reorder queue, shuffle, repeat, save queue as playlist).
 * Pure functions over an immutable queue array.
 */
import type { Song } from "@/lib/types";

export type RepeatMode = "off" | "all" | "one";

export interface QueueState {
  queue: Song[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export function shuffledOrder(queue: Song[], keepSongId?: string): Song[] {
  const arr = [...queue];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  if (keepSongId) {
    const idx = arr.findIndex((s) => s.videoId === keepSongId);
    if (idx > 0) {
      const [song] = arr.splice(idx, 1);
      arr.unshift(song);
    }
  }
  return arr;
}

export function nextIndex(state: QueueState): number | null {
  const { queue, index, repeat, shuffle } = state;
  if (queue.length === 0) return null;
  if (shuffle) {
    if (queue.length === 1) return repeat === "all" ? index : null;
    // random next that is not the current
    let j = index;
    while (j === index) j = Math.floor(Math.random() * queue.length);
    return j;
  }
  if (index < queue.length - 1) return index + 1;
  if (repeat === "all") return 0;
  return null;
}

export function prevIndex(state: QueueState): number | null {
  const { queue, index, repeat, shuffle } = state;
  if (queue.length === 0) return null;
  if (shuffle && queue.length > 1) {
    let j = index;
    while (j === index) j = Math.floor(Math.random() * queue.length);
    return j;
  }
  if (index > 0) return index - 1;
  if (repeat === "all") return queue.length - 1;
  return 0;
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

export function insertAt<T>(arr: T[], items: T[], at: number): T[] {
  const out = [...arr];
  out.splice(at, 0, ...items);
  return out;
}

/** Distinct audio features average of the queue tail — feeds radio extension. */
export function sessionSeeds(queue: Song[], count = 5): string[] {
  return queue.slice(Math.max(0, queue.length - count)).map((s) => s.videoId);
}
