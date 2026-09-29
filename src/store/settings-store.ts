"use client";
/**
 * Settings store — ⚙️ Settings & Security.
 * Persisted to IndexedDB so they survive reloads.
 *
 * Documented assumption: audio-DSP settings (EQ, bass/treble, mono,
 * loudness normalization, crossfade, Web-Audio visualizer) are not
 * technically possible with cross-origin YouTube streaming, so they are
 * not part of the settings surface anymore. Playback settings that work
 * with the YouTube IFrame player remain.
 */
import { create } from "zustand";
import { audioEngine, ALLOWED_PLAYBACK_RATES } from "@/player/yt-engine";
import { idbGet, idbSet } from "@/lib/idb";

export type Quality = "low" | "normal" | "high";

export interface SettingsState {
  hydrated: boolean;
  theme: "dark" | "light" | "system";
  // playback
  gapless: boolean;        // preload next track (instant switch)
  defaultSpeed: number;    // snapped to YouTube-allowed rates
  // streaming / data
  quality: Quality;        // preferred stream quality (best effort)
  dataSaver: boolean;      // lower thumbnail resolution
  autoplay: boolean;       // keep playing with related tracks
  // privacy
  saveHistory: boolean;

  hydrate: () => Promise<void>;
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  applyAudio: () => void;
}

const DEFAULTS = {
  theme: "system" as const,
  gapless: true,
  defaultSpeed: 1,
  quality: "high" as const,
  dataSaver: false,
  autoplay: true,
  saveHistory: true,
};

function persist(state: SettingsState) {
  const {
    hydrated: _h, hydrate: _hy, set: _s, applyAudio: _a,
    ...data
  } = state;
  void _h; void _hy; void _s; void _a;
  idbSet("settings", data);
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  hydrate: async () => {
    const saved = await idbGet<Partial<SettingsState>>("settings");
    set({ ...DEFAULTS, ...saved, hydrated: true });
    get().applyAudio();
  },

  set: (key, value) => {
    set({ [key]: value } as Partial<SettingsState>);
    persist(get());
    if (key === "defaultSpeed") get().applyAudio();
  },

  applyAudio: () => {
    const s = get();
    // snap to a rate YouTube actually supports
    const rate = ALLOWED_PLAYBACK_RATES.reduce(
      (best, r) => (Math.abs(r - s.defaultSpeed) < Math.abs(best - s.defaultSpeed) ? r : best),
      1
    );
    audioEngine.setRate(rate);
  },
}));

export { ALLOWED_PLAYBACK_RATES };
