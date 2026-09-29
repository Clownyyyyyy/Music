/**
 * Media Session integration (spec: 🔒 Lock-screen/media controls).
 * Lock-screen, headset, Bluetooth and notification controls.
 */
import type { Song } from "@/lib/types";

export function updateMediaMetadata(song: Song | null) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !song) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artistName,
      album: song.albumTitle,
      artwork: [
        { src: song.cover, sizes: "512x512", type: "image/jpeg" },
        { src: song.cover, sizes: "256x256", type: "image/jpeg" },
      ],
    });
  } catch {
    /* MediaMetadata unavailable */
  }
}

export function setMediaSessionHandlers(handlers: {
  play: () => void;
  pause: () => void;
  next: () => void;
  prev: () => void;
  seek?: (t: number) => void;
  stop?: () => void;
}) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  const trySet = (action: MediaSessionAction, fn: MediaSessionActionHandler | undefined) => {
    try {
      if (fn) ms.setActionHandler(action, fn);
    } catch {
      /* unsupported action */
    }
  };
  trySet("play", () => handlers.play());
  trySet("pause", () => handlers.pause());
  trySet("nexttrack", () => handlers.next());
  trySet("previoustrack", () => handlers.prev());
  trySet("seekbackward", () => handlers.seek?.(-10));
  trySet("seekforward", () => handlers.seek?.(10));
  trySet("seekto", (details) => {
    if (typeof details.seekTime === "number") handlers.seek?.(details.seekTime);
  });
  trySet("stop", () => handlers.stop?.());
}

export function updatePositionState(duration: number, position: number, rate: number) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    if (duration > 0 && isFinite(duration)) {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate: rate,
      });
    }
  } catch {
    /* noop */
  }
}
