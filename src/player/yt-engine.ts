/**
 * YtAudioEngine — the persistent playback core, now powered by the
 * YouTube IFrame Player API so every track streams REAL audio from
 * YouTube Music (videoId comes from ytmusicapi).
 *
 * Spec compliance where technically possible:
 * - "Keep one persistent player instance for the entire application" —
 *   a single hidden YT.Player (plus a standby player for preloading the
 *   next track) is created once and reused for the app's lifetime.
 * - Media Session integration happens in media-session.ts (unchanged).
 *
 * Technically impossible with a cross-origin YouTube iframe (documented
 * assumption): Web Audio DSP — equalizer, bass/treble, mono, loudness
 * normalization, true crossfade and the AnalyserNode visualizer. The UI
 * reflects this (those controls were removed) and switching tracks uses
 * the preloaded standby player for near-instant transitions instead.
 */

export interface EngineCallbacks {
  onTime?: (time: number, duration: number) => void;
  onEnded?: () => void;
  onPlayState?: (playing: boolean) => void;
  onLoaded?: (duration: number) => void;
  onError?: (message: string, videoId?: string) => void;
  /** unplayable (non-embeddable / missing) — store should skip to next */
  onUnplayable?: (videoId?: string) => void;
  onBuffering?: (buffering: boolean) => void;
}

// YouTube only accepts discrete playback rates
const ALLOWED_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  cueVideoById(id: string, seconds?: number): void;
  loadVideoById(id: string, seconds?: number): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  setVolume(v: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  setPlaybackRate(rate: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getAvailablePlaybackRates(): number[];
  destroy(): void;
  addEventListener(evt: string, fn: (e: unknown) => void): void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: Record<string, unknown>
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number; UNSTARTED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<YTNamespace> | null = null;

function loadIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiLoadPromise) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("YouTube IFrame API load timeout")), 15000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      window.clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error("YT namespace missing after load"));
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    tag.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Failed to load YouTube IFrame API"));
    };
    document.head.appendChild(tag);
  });
  return apiLoadPromise;
}

function snapRate(rate: number): number {
  return ALLOWED_RATES.reduce((best, r) => (Math.abs(r - rate) < Math.abs(best - rate) ? r : best), 1);
}

class YtAudioEngine {
  private active: YTPlayer | null = null;
  private standby: YTPlayer | null = null;
  private host: HTMLElement | null = null;
  private cb: EngineCallbacks = {};
  private ready = false;
  private initing: Promise<void> | null = null;

  private volume = 100; // YT uses 0..100
  private muted = false;
  private rate = 1;
  private currentVideoId = "";
  private standbyVideoId = "";
  private pollTimer: number | null = null;
  private duration = 0;
  private suppressEnded = false;

  init(cb: EngineCallbacks) {
    // merge callbacks on re-init so late callers don't erase earlier handlers
    this.cb = { ...this.cb, ...cb };
    if (this.initing) return;
    this.initing = this.bootstrap().catch((e) => {
      this.initing = null;
      this.cb.onError?.((e as Error).message);
    });
  }

  private async bootstrap() {
    if (this.ready) return;
    if (typeof document === "undefined") return;
    const YT = await loadIframeApi();

    // persistent host element (survives view switches; never remounted)
    this.host = document.createElement("div");
    this.host.id = "yt-audio-host";
    this.host.setAttribute("aria-hidden", "true");
    Object.assign(this.host.style, {
      position: "fixed",
      left: "0",
      bottom: "0",
      width: "240px",
      height: "135px",
      opacity: "0.01",
      pointerEvents: "none",
      zIndex: "-1",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.host);

    const playerVars = {
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      rel: 0,
      fs: 0,
      playsinline: 1,
      iv_load_policy: 3,
    };

    const mkPlayer = (slot: string) =>
      new YT.Player(slot, {
        height: "135",
        width: "240",
        playerVars,
        events: {
          onReady: () => {
            if (slot === "yt-audio-active") {
              this.ready = true;
              this.active?.setVolume(this.volume);
              if (this.muted) this.active?.mute();
              this.active?.setPlaybackRate(this.rate);
              this.startPolling();
            }
          },
          onStateChange: (e: { data: number }) => this.onState(slot, e.data),
          onError: (e: { data: number }) => this.onError(slot, e.data),
        },
      });

    const activeDiv = document.createElement("div");
    activeDiv.id = "yt-audio-active";
    this.host.appendChild(activeDiv);
    this.active = mkPlayer("yt-audio-active");

    const standbyDiv = document.createElement("div");
    standbyDiv.id = "yt-audio-standby";
    this.host.appendChild(standbyDiv);
    this.standby = mkPlayer("yt-audio-standby");
  }

  private onState(slot: string, state: number) {
    if (slot !== "yt-audio-active" || !this.ready) return;
    const YT = window.YT;
    if (!YT) return;
    if (state === YT.PlayerState.PLAYING) {
      this.cb.onPlayState?.(true);
      const dur = this.active?.getDuration() || 0;
      if (dur > 0 && isFinite(dur)) {
        this.duration = dur;
        this.cb.onLoaded?.(dur);
      }
    } else if (state === YT.PlayerState.PAUSED) {
      this.cb.onPlayState?.(false);
    } else if (state === YT.PlayerState.ENDED) {
      if (this.suppressEnded) {
        this.suppressEnded = false;
        return;
      }
      this.cb.onPlayState?.(false);
      this.cb.onEnded?.();
    } else if (state === YT.PlayerState.BUFFERING) {
      this.cb.onBuffering?.(true);
    } else if (state === YT.PlayerState.CUED || state === YT.PlayerState.UNSTARTED) {
      this.cb.onBuffering?.(false);
    }
  }

  private onError(slot: string, code: number) {
    if (slot !== "yt-audio-active") return;
    const map: Record<number, string> = {
      2: "Invalid video parameter",
      5: "HTML5 player error",
      100: "Video not found or removed",
      101: "Video not embeddable",
      150: "Video not embeddable",
    };
    const message = map[code] || `Player error ${code}`;
    if (code === 101 || code === 150 || code === 100 || code === 5 || code === 2) {
      // the player may also emit ENDED after an error — suppress it so the
      // store's skip logic advances exactly once
      this.suppressEnded = true;
      window.setTimeout(() => { this.suppressEnded = false; }, 1500);
      this.cb.onUnplayable?.(this.currentVideoId);
    }
    this.cb.onError?.(message, this.currentVideoId);
  }

  private startPolling() {
    if (this.pollTimer != null) return;
    this.pollTimer = window.setInterval(() => {
      if (!this.active || !this.ready) return;
      const state = this.active.getPlayerState();
      if (state === 1 || state === 3) {
        const t = this.active.getCurrentTime();
        const d = this.active.getDuration() || this.duration;
        if (d > 0) this.duration = d;
        this.cb.onTime?.(t, d);
      }
    }, 250);
  }

  get isReady(): boolean {
    return this.ready;
  }

  get currentVideo(): string {
    return this.currentVideoId;
  }

  get currentTime(): number {
    return this.ready ? this.active?.getCurrentTime() || 0 : 0;
  }

  get durationValue(): number {
    return this.ready ? this.active?.getDuration() || this.duration : this.duration;
  }

  get isPlaying(): boolean {
    return this.ready ? this.active?.getPlayerState() === 1 : false;
  }

  /** Play a video now. Must be called from a user gesture the first time. */
  loadAndPlay(videoId: string, opts: { startTime?: number } = {}) {
    if (!videoId) return;
    this.currentVideoId = videoId;
    this.standbyVideoId = "";
    if (!this.ready || !this.active) {
      // queue until ready; init() is called at app boot
      void this.initing?.then(() => this.loadAndPlay(videoId, opts));
      return;
    }
    this.suppressEnded = false;
    this.active.loadVideoById(videoId, opts.startTime || 0);
    this.active.setPlaybackRate(this.rate);
    if (this.muted) this.active.mute();
  }

  /** Cue a video paused (session restore) without playing. */
  preparePaused(videoId: string, startTime = 0) {
    if (!videoId) return;
    this.currentVideoId = videoId;
    if (!this.ready || !this.active) {
      void this.initing?.then(() => this.preparePaused(videoId, startTime));
      return;
    }
    this.suppressEnded = true; // cueVideoById may emit ENDED in some states
    this.active.cueVideoById(videoId, startTime);
  }

  /** Preload the next track into the standby player for instant switching. */
  prepareNext(videoId: string) {
    if (!videoId || !this.standby || !videoId) return;
    if (this.standbyVideoId === videoId) return;
    this.standbyVideoId = videoId;
    this.standby.cueVideoById(videoId, 0);
  }

  async play() {
    if (!this.ready || !this.active) return;
    if (this.active.getPlayerState() === 5 || this.active.getPlayerState() === -1) {
      // cued but not started -> load (starts) the current id
      if (this.currentVideoId) this.active.loadVideoById(this.currentVideoId, 0);
      return;
    }
    this.active.playVideo();
  }

  pause() {
    if (this.ready) this.active?.pauseVideo();
  }

  async toggle() {
    if (!this.ready || !this.active) return;
    const state = this.active.getPlayerState();
    if (state === 1) this.active.pauseVideo();
    else await this.play();
  }

  seek(time: number) {
    if (!this.ready || !this.active) return;
    const d = this.active.getDuration() || this.duration;
    this.active.seekTo(Math.max(0, Math.min(time, d || time)), true);
    this.cb.onTime?.(time, d);
  }

  seekBy(delta: number) {
    this.seek(this.currentTime + delta);
  }

  /** Seconds remaining before natural end. */
  timeLeft(): number {
    const d = this.durationValue;
    if (!d || !isFinite(d)) return Infinity;
    return Math.max(0, d - this.currentTime);
  }
  // ---------------- settings ----------------

  setVolume(v: number) {
    this.volume = Math.round(Math.max(0, Math.min(1, v)) * 100);
    if (this.ready) this.active?.setVolume(this.volume);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (!this.ready || !this.active) return;
    if (m) this.active.mute();
    else this.active.unMute();
  }

  setRate(rate: number) {
    this.rate = snapRate(rate);
    if (this.ready) this.active?.setPlaybackRate(this.rate);
  }

  destroy() {
    if (this.pollTimer != null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.active?.destroy();
    this.standby?.destroy();
    this.host?.remove();
    this.ready = false;
  }
}

export const audioEngine = new YtAudioEngine();
export const ALLOWED_PLAYBACK_RATES = ALLOWED_RATES;
