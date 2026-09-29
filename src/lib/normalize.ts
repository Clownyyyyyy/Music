/**
 * normalize.ts — server-side normalization of raw ytmusicapi payloads into
 * the app's DTOs. Real YouTube Music responses are inconsistent (missing
 * artists, byline-only data, different thumbnail sizes); this layer makes
 * them uniform so the UI can rely on stable shapes.
 */
import type {
  Album, Artist, ChartArtist, ChartSong, Charts, HomeRow, MoodCategories,
  PlaylistDetail, PlaylistSummary, Song, Thumbnail,
} from "./types";

type Any = Record<string, any>;

/* ------------------------------------------------------------ helpers --- */

export function bestThumb(thumbs: Any | Any[] | undefined | null, min = 400): string {
  if (!Array.isArray(thumbs)) return "";
  const valid = thumbs.filter((t) => t?.url) as { url: string; width?: number }[];
  if (valid.length === 0) return "";
  const sorted = [...valid].sort((a, b) => (a.width || 0) - (b.width || 0));
  const picked = sorted.find((t) => (t.width || 0) >= min) || sorted[sorted.length - 1];
  // ytmusicapi returns protocol-relative urls
  return picked.url.startsWith("//") ? `https:${picked.url}` : picked.url;
}

function artistNameOf(item: Any): string {
  const arts = item.artists || item.artist || [];
  if (Array.isArray(arts) && arts.length > 0 && arts[0]?.name) return arts[0].name;
  const byline = item.byline || item.longBylineText || item.subtitle || "";
  if (typeof byline === "string" && byline) return byline.split("•")[0].trim();
  return "Unknown artist";
}

function durationOf(item: Any): { duration: string; seconds: number } {
  let duration = item.duration || item.durationText || "";
  if (item.duration_seconds == null && typeof item.duration === "string") {
    duration = item.duration;
  }
  let seconds = Number(item.duration_seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    seconds = parseDuration(duration);
  }
  if (!duration && seconds > 0) duration = formatDuration(seconds);
  return { duration: duration || "", seconds: seconds > 0 ? seconds : 0 };
}

export function parseDuration(s: string): number {
  if (!s) return 0;
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function formatDuration(total: number): string {
  if (!Number.isFinite(total) || total <= 0) return "";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** song covers default to a videoId-derived thumbnail when none provided */
function coverFor(item: Any, thumbs: string): string {
  if (thumbs) return thumbs;
  if (item.videoId) return `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`;
  return "";
}

/* --------------------------------------------------------------- songs --- */

export function normSong(item: Any): Song | null {
  const videoId = item?.videoId;
  if (!videoId) return null;
  const { duration, seconds } = durationOf(item);
  const artists = (Array.isArray(item.artists) && item.artists.length > 0
    ? item.artists.map((a: Any) => ({ name: a?.name || "Unknown artist", id: a?.id || null }))
    : [{ name: artistNameOf(item), id: null }]);
  const album = item.album?.name
    ? { name: item.album.name, id: item.album.id || null }
    : null;
  return {
    videoId,
    title: item.title || "Unknown title",
    artists,
    artistName: artists[0].name,
    album,
    albumId: album?.id || "",
    albumTitle: album?.name || "",
    duration,
    duration_seconds: seconds,
    thumbnails: Array.isArray(item.thumbnails) ? item.thumbnails : [],
    cover: coverFor(item, bestThumb(item.thumbnails)),
    playlistId: item.playlistId || null,
    isExplicit: !!item.isExplicit,
    resultType: item.category === "Videos" || item.videoType === "MUSIC_VIDEO_TYPE_ATV" ? "video" : item.resultType || "song",
    views: typeof item.views === "string" ? item.views : undefined,
  };
}

export function normSongList(items: Any[] | undefined | null): Song[] {
  if (!Array.isArray(items)) return [];
  const out: Song[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const s = normSong(item);
    if (s && !seen.has(s.videoId)) {
      seen.add(s.videoId);
      out.push(s);
    }
  }
  return out;
}

/* -------------------------------------------------------------- albums --- */

export function normAlbum(item: Any): Album | null {
  const browseId = item?.browseId;
  const title = item?.title;
  if (!browseId || !title) return null;
  const artists = (Array.isArray(item.artists) && item.artists.length > 0
    ? item.artists.map((a: Any) => ({ name: a?.name || "Unknown artist", id: a?.id || null }))
    : [{ name: artistNameOf(item), id: null }]);
  return {
    browseId,
    playlistId: item.audioPlaylistId || item.playlistId || null,
    title,
    artists,
    artistName: artists[0].name,
    year: item.year ? Number(item.year) : null,
    thumbnails: Array.isArray(item.thumbnails) ? item.thumbnails : [],
    cover: bestThumb(item.thumbnails),
    trackCount: item.trackCount ?? undefined,
    duration: item.duration || undefined,
    duration_seconds: parseDuration(item.duration || ""),
    resultType: "album",
    type: item.type || item.category || "Album",
  };
}

export function normAlbumList(items: Any[] | undefined | null): Album[] {
  if (!Array.isArray(items)) return [];
  const out: Album[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const a = normAlbum(item);
    if (a && !seen.has(a.browseId)) { seen.add(a.browseId); out.push(a); }
  }
  return out;
}

/* ------------------------------------------------------------- artists --- */

export function normArtist(item: Any): Artist | null {
  const browseId = item?.browseId;
  const title = item?.artist || item?.title || item?.name;
  if (!browseId || !title) return null;
  const thumbs = Array.isArray(item.thumbnails) ? item.thumbnails : [];
  return {
    browseId,
    title,
    name: title,
    subscribers: item.subscriberCount || null,
    thumbnails: thumbs,
    avatar: bestThumb(thumbs, 200),
    resultType: "artist",
  };
}

export function normArtistList(items: Any[] | undefined | null): Artist[] {
  if (!Array.isArray(items)) return [];
  const out: Artist[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const a = normArtist(item);
    if (a && !seen.has(a.browseId)) { seen.add(a.browseId); out.push(a); }
  }
  return out;
}

/* ----------------------------------------------------------- playlists --- */

export function normPlaylistSummary(item: Any, kind: "yt" | "local" = "yt"): PlaylistSummary | null {
  const playlistId = item?.playlistId || item?.id;
  const title = item?.title;
  if (!playlistId || !title) return null;
  const thumbs = Array.isArray(item.thumbnails) ? item.thumbnails : [];
  return {
    playlistId,
    title,
    description: item.description || null,
    thumbnails: thumbs,
    cover: bestThumb(thumbs),
    count: item.count ?? undefined,
    subtitle: item.subtitle || item.author?.name || null,
    kind,
  };
}

export function normPlaylistDetail(data: Any): PlaylistDetail | null {
  const id = data?.id || data?.playlistId;
  const title = data?.title;
  if (!id || !title) return null;
  const thumbs = Array.isArray(data.thumbnails) ? data.thumbnails : [];
  const tracks = normSongList(data.tracks);
  return {
    playlistId: id,
    id,
    title,
    description: data.description || null,
    thumbnails: thumbs,
    cover: bestThumb(thumbs),
    count: data.trackCount ?? tracks.length,
    subtitle: data.author?.name || null,
    kind: "yt",
    author: {
      name: data.author?.name || "YouTube Music",
      id: data.author?.id || null,
    },
    year: data.year ? String(data.year) : undefined,
    duration: data.duration || undefined,
    duration_seconds: parseDuration(data.duration || ""),
    trackCount: data.trackCount ?? tracks.length,
    tracks,
    related: Array.isArray(data.related)
      ? data.related.map((r: Any) => normPlaylistSummary(r)).filter(Boolean) as PlaylistSummary[]
      : undefined,
    suggestions: normSongList(data.suggestions),
  };
}

/* ---------------------------------------------------------------- home --- */

export function normHomeRows(sections: Any[] | undefined | null): HomeRow[] {
  if (!Array.isArray(sections)) return [];
  const rows: HomeRow[] = [];
  for (const section of sections) {
    const title = section?.title || "";
    const raw = Array.isArray(section?.contents) ? section.contents : [];
    const contents: HomeRow["contents"] = [];
    const seen = new Set<string>();
    for (const item of raw) {
      let obj: HomeRow["contents"][number] | null = null;
      let key = "";
      if (item.videoId) {
        const s = normSong(item);
        if (s) { obj = s; key = `s:${s.videoId}`; }
      } else if (item.browseId && item.playlistId) {
        const p = normPlaylistSummary(item);
        if (p) { obj = p; key = `p:${p.playlistId}`; }
      } else if (item.browseId && item.audioPlaylistId) {
        const a = normAlbum(item);
        if (a) { obj = a; key = `a:${a.browseId}`; }
      } else if (item.browseId && !item.playlistId && !item.audioPlaylistId) {
        const ar = normArtist(item);
        if (ar) { obj = ar; key = `ar:${ar.browseId}`; }
      } else if (item.playlistId) {
        const p = normPlaylistSummary(item);
        if (p) { obj = p; key = `p:${p.playlistId}`; }
      }
      if (obj && !seen.has(key)) { seen.add(key); contents.push(obj); }
    }
    if (contents.length > 0) rows.push({ title, contents });
  }
  return rows;
}

/* -------------------------------------------------------------- charts --- */

export function normCharts(data: Any, country: string): Charts {
  const countries = {
    selected: data?.countries?.selected || country,
    options: (Array.isArray(data?.countries?.options) ? data.countries.options : []) as string[],
  };
  const songs: ChartSong[] = (Array.isArray(data?.videos) ? data.videos : [])
    .map((v: Any): ChartSong | null => {
      if (!v?.videoId) return null;
      return {
        videoId: v.videoId,
        title: v.title || "Unknown title",
        artists: Array.isArray(v.artists) && v.artists.length
          ? v.artists.map((a: Any) => ({ name: a?.name || "Unknown artist", id: a?.id || null }))
          : [{ name: artistNameOf(v), id: null }],
        thumbnails: Array.isArray(v.thumbnails) ? v.thumbnails : [],
        cover: coverFor(v, bestThumb(v.thumbnails)),
        rank: String(v.rank ?? ""),
        trend: v.trend === "UP" ? "up" : v.trend === "DOWN" ? "down" : "neutral",
        views: String(v.views ?? ""),
      };
    })
    .filter(Boolean) as ChartSong[];
  const artists: ChartArtist[] = (Array.isArray(data?.artists) ? data.artists : [])
    .map((a: Any): ChartArtist | null => {
      if (!a?.browseId) return null;
      const thumbs = Array.isArray(a.thumbnails) ? a.thumbnails : [];
      return {
        title: a.title || "Unknown artist",
        browseId: a.browseId,
        subscribers: String(a.subscribers ?? ""),
        thumbnails: thumbs,
        avatar: bestThumb(thumbs, 200),
        rank: String(a.rank ?? ""),
        trend: a.trend === "UP" ? "up" : a.trend === "DOWN" ? "down" : "neutral",
      };
    })
    .filter(Boolean) as ChartArtist[];
  const genres = (Array.isArray(data?.genres) ? data.genres : [])
    .map((g: Any) => ({
      title: g?.title || "",
      playlistId: g?.playlistId || "",
      cover: bestThumb(g?.thumbnails),
    }))
    .filter((g: Any) => g.playlistId);
  return { countries, songs, artists, genres };
}

/* --------------------------------------------------------------- moods --- */

export function normMoodCategories(data: Any): MoodCategories {
  const sections: MoodCategories["sections"] = [];
  for (const [title, cats] of Object.entries(data || {})) {
    if (!Array.isArray(cats)) continue;
    sections.push({
      title,
      categories: cats
        .filter((c: Any) => c?.title && c?.params)
        .map((c: Any) => ({ title: c.title, params: c.params })),
    });
  }
  return { sections };
}

/* -------------------------------------------------------------- search --- */

export interface SearchResults {
  top: (Song | Album | Artist | PlaylistSummary) | null;
  songs: Song[];
  videos: Song[];
  albums: Album[];
  artists: Artist[];
  playlists: PlaylistSummary[];
}

export function normSearchResults(results: Any[] | undefined | null): SearchResults {
  const out: SearchResults = { top: null, songs: [], videos: [], albums: [], artists: [], playlists: [] };
  if (!Array.isArray(results)) return out;
  for (const item of results) {
    const type = item?.resultType;
    switch (type) {
      case "song": {
        const s = normSong(item);
        if (s) out.songs.push(s);
        break;
      }
      case "video": {
        const s = normSong(item);
        if (s) out.videos.push(s);
        break;
      }
      case "album": {
        const a = normAlbum(item);
        if (a) out.albums.push(a);
        break;
      }
      case "artist": {
        const ar = normArtist(item);
        if (ar) out.artists.push(ar);
        break;
      }
      case "playlist":
      case "community_playlist":
      case "featured_playlist": {
        const p = normPlaylistSummary(item);
        if (p) out.playlists.push(p);
        break;
      }
      case "top": {
        if (item.videoId) {
          const s = normSong(item);
          if (s) out.top = s;
        } else if (item.browseId && item.audioPlaylistId) {
          const a = normAlbum(item);
          if (a) out.top = a;
        } else if (item.playlistId) {
          const p = normPlaylistSummary(item);
          if (p) out.top = p;
        } else if (item.browseId) {
          const ar = normArtist(item);
          if (ar) out.top = ar;
        }
        break;
      }
      default:
        break;
    }
  }
  if (!out.top) {
    // fall back to the first song/artist as the top result
    out.top = out.songs[0] || out.artists[0] || out.albums[0] || out.playlists[0] || null;
  }
  return out;
}
