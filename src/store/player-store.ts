"use client";
/**
 * Player store — binds the persistent YtAudioEngine + QueueManager.
 * Handles: play/pause/seek/next/prev, shuffle, repeat, speed, volume, mute,
 * gapless preloading (standby player), up-next queue management, smart radio
 * extension via REAL /api/watch playlists, the feedback loop (skip/complete
 * signals -> /api/feedback), Media Session metadata and IndexedDB persistence
 * of the current session (full track snapshots — restores offline).
 */
import { create } from "zustand";
import { audioEngine } from "@/player/yt-engine";
import {
  nextIndex, prevIndex, moveItem, shuffledOrder, insertAt,
  type RepeatMode,
} from "@/player/queue-manager";
import { updateMediaMetadata, setMediaSessionHandlers, updatePositionState } from "@/player/media-session";
import { useSettings } from "@/store/settings-store";
import { idbGet, idbSet } from "@/lib/idb";
import { toast } from "@/hooks/use-toast";
import type { Song } from "@/lib/types";

let mediaSessionWired = false;
let tickerWired = false;
/** prevents double-advance when YT fires ENDED right after a manual switch */
let switchGuard: number | null = null;
/** consecutive unplayable skips (protects against endless skip loops) */
let consecutiveSkips = 0;

function postFeedback(payload: {
  song: Song | null;
  percentPlayed: number;
  skipped: boolean;
  prevSongId?: string | null;
  context?: string;
}) {
  if (!payload.song?.videoId) return;
  const saveHistory = useSettings.getState().saveHistory;
  fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      videoId: payload.song.videoId,
      track: payload.song,
      percentPlayed: payload.percentPlayed,
      skipped: payload.skipped,
      prevSongId: payload.prevSongId,
      context: payload.context,
      saveHistory,
    }),
    keepalive: true,
  }).catch(() => {});
}

export interface PlayerState {
  current: Song | null;
  queue: Song[];
  originalQueue: Song[];
  index: number;
  context: string;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  speed: number;
  radio: boolean; // autoplay extension on

  init: () => void;
  playList: (songs: Song[], startIndex?: number, context?: string, opts?: { shuffle?: boolean; radio?: boolean }) => void;
  playNow: (song: Song, context?: string) => void;
  toggle: () => void;
  next: (manual?: boolean) => void;
  prev: () => void;
  seek: (t: number) => void;
  seekByDelta: (delta: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setSpeed: (s: number) => void;
  toggleRadio: () => void;
  addToQueue: (songs: Song[], at?: "end" | "next") => void;
  removeFromQueue: (queueIdx: number) => void;
  reorderQueue: (from: number, to: number) => void;
  jumpTo: (queueIdx: number) => void;
  clearQueueUpNext: () => void;
  toggleLike: (song?: Song) => Promise<void>;
  persistSession: () => void;
  restoreSession: () => Promise<void>;
}

/** report listening signal for the currently playing song */
function reportCurrent(state: PlayerState, skipped: boolean) {
  const cur = state.current;
  if (!cur?.videoId) return;
  const percent = state.duration > 0 ? Math.min(1, state.position / state.duration) : 0;
  postFeedback({
    song: cur,
    percentPlayed: percent,
    skipped: skipped && percent < 0.8,
    context: state.context,
  });
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  queue: [],
  originalQueue: [],
  index: -1,
  context: "manual",
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  volume: 1,
  muted: false,
  shuffle: false,
  repeat: "off",
  speed: 1,
  radio: false,

  init: () => {
    const settings = useSettings.getState();
    audioEngine.init({
      onTime: (time, dur) => {
        set({ position: time, duration: dur || get().duration });
        updatePositionState(dur || get().duration, time, get().speed);
      },
      onEnded: () => {
        const st = get();
        reportCurrent(st, false);
        handleTrackEnd();
      },
      onPlayState: (playing) => set({ playing }),
      onLoaded: (dur) => {
        if (dur && isFinite(dur)) {
          consecutiveSkips = 0;
          set({ duration: dur });
        }
      },
      onBuffering: (buffering) => set({ buffering }),
      onError: (_message) => {
        set({ playing: false, buffering: false });
      },
      onUnplayable: (videoId) => {
        // non-embeddable/removed track -> skip forward (bounded loop guard)
        console.warn("[player] unplayable track, skipping:", videoId);
        const st = get();
        if (consecutiveSkips >= 5 || st.queue.length <= 1) {
          consecutiveSkips = 0;
          set({ playing: false });
          toast({
            title: "Can't play this track",
            description: "YouTube blocked playback of this video (not embeddable or removed). Try another song.",
          });
          return;
        }
        consecutiveSkips += 1;
        toast({
          title: "Skipped unplayable track",
          description: st.queue[st.index]?.title || undefined,
        });
        st.next(true);
      },
    });
    audioEngine.setVolume(get().volume);
    audioEngine.setMuted(get().muted);

    if (!tickerWired) {
      tickerWired = true;
      window.setInterval(persistPosition, 3000);
      window.addEventListener("beforeunload", () => {
        const st = get();
        reportCurrent(st, false);
        st.persistSession();
      });
    }

    if (!mediaSessionWired && typeof navigator !== "undefined" && "mediaSession" in navigator) {
      mediaSessionWired = true;
      setMediaSessionHandlers({
        play: () => get().toggle(),
        pause: () => get().toggle(),
        next: () => get().next(true),
        prev: () => get().prev(),
        seek: (t) => get().seekByDelta(t),
        stop: () => get().toggle(),
      });
    }
  },

  playList: (songs, startIndex = 0, context = "manual", opts) => {
    if (songs.length === 0) return;
    let queue = [...songs];
    let originalQueue = [...songs];
    let index = Math.max(0, Math.min(startIndex, songs.length - 1));
    if (opts?.shuffle) {
      const keep = queue[index].videoId;
      queue = shuffledOrder(queue, keep);
      index = 0;
    }
    set({ queue, originalQueue, index, context, radio: opts?.radio ?? false });
    const song = queue[index];
    startSong(song, useSettings.getState(), get, set);
  },

  playNow: (song, context = "manual") => {
    const st = get();
    const existing = st.queue.findIndex((s) => s.videoId === song.videoId);
    if (existing >= 0 && st.context === context) {
      set({ index: existing });
      startSong(song, useSettings.getState(), get, set);
    } else {
      get().playList([song], 0, context);
    }
  },

  toggle: () => {
    audioEngine.toggle();
  },

  next: (manual = false) => {
    const st = get();
    reportCurrent(st, manual);
    if (switchGuard != null) window.clearTimeout(switchGuard);
    advanceTo(nextIndex(st), get, set);
  },

  prev: () => {
    const st = get();
    // standard behavior: restart if >3s into the track
    if (st.position > 3 && !st.shuffle) {
      audioEngine.seek(0);
      set({ position: 0 });
      return;
    }
    reportCurrent(st, true);
    advanceTo(prevIndex(st), get, set);
  },

  seek: (t) => {
    audioEngine.seek(t);
    set({ position: t });
  },

  seekByDelta: (delta: number) => {
    audioEngine.seekBy(delta);
  },

  setVolume: (v) => {
    set({ volume: v, muted: false });
    audioEngine.setVolume(v);
    audioEngine.setMuted(false);
  },

  toggleMute: () => {
    const m = !get().muted;
    set({ muted: m });
    audioEngine.setMuted(m);
  },

  toggleShuffle: () => {
    const st = get();
    const shuffle = !st.shuffle;
    if (st.queue.length === 0) {
      set({ shuffle });
      return;
    }
    if (shuffle) {
      const currentSong = st.queue[st.index];
      const shuffled = shuffledOrder(st.queue, currentSong?.videoId);
      set({ shuffle, queue: shuffled, originalQueue: st.queue, index: 0 });
    } else {
      const currentSong = st.queue[st.index];
      const restored = st.originalQueue.length ? st.originalQueue : st.queue;
      const idx = currentSong ? restored.findIndex((s) => s.videoId === currentSong.videoId) : 0;
      set({ shuffle, queue: restored, index: Math.max(0, idx) });
    }
  },

  cycleRepeat: () => {
    const order: RepeatMode[] = ["off", "all", "one"];
    const cur = order.indexOf(get().repeat);
    set({ repeat: order[(cur + 1) % 3] });
  },

  setSpeed: (s) => {
    set({ speed: s });
    audioEngine.setRate(s);
  },

  toggleRadio: () => {
    const st = get();
    const radio = !st.radio;
    set({ radio });
    if (radio) extendRadio(get, set);
  },

  addToQueue: (songs, at = "end") => {
    const st = get();
    if (st.queue.length === 0) {
      get().playList(songs, 0, "queue");
      return;
    }
    if (at === "next") {
      const queue = insertAt(st.queue, songs, st.index + 1);
      set({ queue });
    } else {
      set({ queue: [...st.queue, ...songs] });
    }
    get().persistSession();
  },

  removeFromQueue: (queueIdx) => {
    const st = get();
    if (queueIdx === st.index) return;
    const queue = st.queue.filter((_, i) => i !== queueIdx);
    const index = queueIdx < st.index ? st.index - 1 : st.index;
    set({ queue, index });
    get().persistSession();
  },

  reorderQueue: (from, to) => {
    const st = get();
    if (from === st.index || to === st.index) return;
    const queue = moveItem(st.queue, from, to);
    const index = from < st.index && to >= st.index ? st.index - 1
      : from > st.index && to <= st.index ? st.index + 1
      : st.index;
    set({ queue, index });
    get().persistSession();
  },

  jumpTo: (queueIdx) => {
    const st = get();
    if (queueIdx < 0 || queueIdx >= st.queue.length) return;
    reportCurrent(st, true);
    set({ index: queueIdx });
    startSong(st.queue[queueIdx], useSettings.getState(), get, set);
  },

  clearQueueUpNext: () => {
    const st = get();
    set({ queue: st.queue.slice(0, st.index + 1) });
  },

  toggleLike: async (song) => {
    const cur = song || get().current;
    if (!cur?.videoId) return;
    const nextStatus = cur.likeStatus === "LIKE" ? "INDIFFERENT" : "LIKE";
    // optimistic update in queue + current
    set({
      current: get().current?.videoId === cur.videoId ? { ...cur, likeStatus: nextStatus } : get().current,
      queue: get().queue.map((s) => (s.videoId === cur.videoId ? { ...s, likeStatus: nextStatus } : s)),
    });
    if (!song) updateMediaMetadata({ ...cur, likeStatus: nextStatus });
    try {
      await fetch("/api/liked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: cur.videoId, rating: nextStatus, track: cur }),
      });
    } catch {
      /* revert not critical */
    }
  },

  persistSession: () => {
    const st = get();
    if (!st.current) return;
    // full snapshots (capped) so restore needs no network
    idbSet("playerSession", {
      queue: st.queue.slice(0, 200),
      index: st.index,
      context: st.context,
      position: st.position,
      volume: st.volume,
      shuffle: st.shuffle,
      repeat: st.repeat,
      radio: st.radio,
    });
  },

  restoreSession: async () => {
    const session = await idbGet<{
      queue: Song[]; index: number; context: string; position: number;
      volume?: number; shuffle?: boolean; repeat?: RepeatMode; radio?: boolean;
    }>("playerSession");
    if (!session?.queue?.length) return;
    const songs = session.queue.filter((s) => s && s.videoId && s.title);
    if (songs.length === 0) return;
    const idx = Math.min(session.index || 0, songs.length - 1);
    const restored = songs.map((s) => ({ ...s, likeStatus: s.likeStatus ?? "INDIFFERENT" as const }));
    set({
      queue: restored,
      originalQueue: restored,
      index: idx,
      context: session.context || "manual",
      volume: session.volume ?? 1,
      shuffle: session.shuffle ?? false,
      repeat: session.repeat ?? "off",
      radio: session.radio ?? false,
      current: restored[idx],
      position: session.position || 0,
    });
    // cue the track paused — real playback starts on the first user play
    audioEngine.preparePaused(restored[idx].videoId, session.position || 0);
    updateMediaMetadata(restored[idx]);
  },
}));

// ---------------- internal helpers ----------------

function startSong(
  song: Song,
  settings: ReturnType<typeof useSettings.getState>,
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void
) {
  const prev = get().current;
  if (prev?.videoId && prev.videoId !== song.videoId) {
    // report the outgoing track before switching
    const st = get();
    const percent = st.duration > 0 ? Math.min(1, st.position / st.duration) : 0;
    if (percent > 0.05) {
      postFeedback({ song: prev, percentPlayed: percent, skipped: true, context: st.context });
    }
  }
  set({ current: song, position: 0, duration: song.duration_seconds || 0, buffering: true });
  if (switchGuard != null) window.clearTimeout(switchGuard);
  switchGuard = window.setTimeout(() => { switchGuard = null; }, 800);
  updateMediaMetadata(song);
  audioEngine.setRate(settings.defaultSpeed);
  audioEngine.loadAndPlay(song.videoId);
  // gapless: preload the next track into the standby player
  const st = get();
  if (settings.gapless) {
    const ni = nextIndex({ ...st, index: st.index });
    if (ni != null && st.queue[ni]) audioEngine.prepareNext(st.queue[ni].videoId);
  }
  get().persistSession();
  // radio extension: keep the queue topped up
  if (get().radio || useSettings.getState().autoplay) {
    extendRadio(get, set);
  }
}

function advanceTo(
  idx: number | null,
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void
) {
  const st = get();
  const settings = useSettings.getState();
  if (idx == null) {
    // end of queue
    audioEngine.pause();
    if (st.queue.length > 0) set({ index: 0, position: 0, playing: false });
    return;
  }
  set({ index: idx });
  startSong(st.queue[idx], settings, get, set);
}

function handleTrackEnd() {
  const st = usePlayer.getState();
  if (st.repeat === "one") {
    audioEngine.seek(0);
    audioEngine.play();
    return;
  }
  st.next(false);
}

function setQuiet(partial: Partial<PlayerState>) {
  usePlayer.setState(partial);
}
void setQuiet;

function persistPosition() {
  const st = usePlayer.getState();
  if (!st.current) return;
  st.persistSession();
}

/** Smart radio / autoplay: extend the queue with REAL related tracks. */
async function extendRadio(
  get: () => PlayerState,
  set: (partial: Partial<PlayerState>) => void
) {
  const st = get();
  if (st.queue.length === 0) return;
  const isRadio = st.radio;
  const autoplay = useSettings.getState().autoplay;
  if (!isRadio && !autoplay) return;
  // still buffered? (radio tops up within 5; autoplay tops up when playing a lone track or near the end)
  const remaining = st.queue.length - st.index;
  if (isRadio && remaining > 5) return;
  if (!isRadio && remaining > 2 && st.queue.length > 1) return;
  const seed = st.queue[st.queue.length - 1]?.videoId;
  if (!seed) return;
  try {
    const res = await fetch(`/api/watch?videoId=${seed}&radio=true&limit=${isRadio ? 8 : 12}`);
    if (!res.ok) return;
    const json = await res.json();
    const tracks: Song[] = json.tracks || [];
    const existing = new Set(st.queue.map((s) => s.videoId));
    const additions = tracks.filter((t) => t.videoId && !existing.has(t.videoId));
    if (additions.length > 0) {
      set({ queue: [...get().queue, ...additions] });
      const ni = nextIndex({ ...get(), index: get().index });
      if (ni != null && get().queue[ni]) {
        audioEngine.prepareNext(get().queue[ni].videoId);
      }
    }
  } catch {
    /* offline */
  }
}
