/**
 * Shared API types — every music item here comes live from ytmusicapi
 * (YouTube Music). Field names follow ytmusicapi conventions
 * (videoId, browseId, playlistId, thumbnails, resultType...).
 */

export type LikeStatus = "LIKE" | "DISLIKE" | "INDIFFERENT";

export interface Thumbnail {
  url: string;
  width: number;
  height: number;
}

export interface ArtistRef {
  name: string;
  id?: string | null;
}

export interface AlbumRef {
  name: string;
  id?: string | null;
}

/** A playable track — mirrors ytmusicapi song / watch-playlist track shape. */
export interface Song {
  videoId: string;
  title: string;
  artists: ArtistRef[];
  artistName: string;
  album: AlbumRef | null;
  albumId: string;
  albumTitle: string;
  duration: string;
  duration_seconds: number;
  thumbnails: Thumbnail[];
  cover: string;
  /** playlistId that continues this track (radio) — set by watch responses */
  playlistId?: string | null;
  isExplicit?: boolean;
  resultType?: "song" | "video";
  /** view count as formatted string, present on videos/charts */
  views?: string;
  /** present in recommendation results */
  score?: number;
  reason?: string;
  likeStatus?: LikeStatus;
}

export interface Album {
  browseId: string;
  playlistId?: string | null;
  title: string;
  artists: ArtistRef[];
  artistName: string;
  year: number | null;
  thumbnails: Thumbnail[];
  cover: string;
  trackCount?: number;
  duration?: string;
  duration_seconds?: number;
  resultType?: "album";
  type?: string;
}

export interface Artist {
  browseId: string;
  title: string;
  name?: string;
  subscribers?: string | null;
  thumbnails: Thumbnail[];
  avatar?: string;
  resultType?: "artist";
}

export interface PlaylistSummary {
  playlistId: string;
  title: string;
  description?: string | null;
  thumbnails: Thumbnail[];
  cover: string;
  count?: number;
  subtitle?: string | null;
  /** "yt" (YouTube Music public) or "local" (user-owned) */
  kind: "yt" | "local";
}

export interface PlaylistDetail extends PlaylistSummary {
  id: string;
  author: { name: string; id: string | null };
  year?: string;
  duration?: string;
  duration_seconds?: number;
  trackCount: number;
  tracks: Song[];
  related?: PlaylistSummary[];
  suggestions?: Song[];
}

export interface LyricLineDTO {
  id: number;
  start_time: number;
  end_time: number;
  text: string;
}

export interface LyricsDTO {
  hasTimestamps: boolean;
  source: string;
  lyrics: string | LyricLineDTO[];
}

export interface HistoryDay {
  date: string;
  entries: (Song & { played: string; percentPlayed: number })[];
}

export interface ChartSong {
  videoId: string;
  title: string;
  artists: ArtistRef[];
  thumbnails: Thumbnail[];
  cover: string;
  rank: string;
  trend: "up" | "down" | "neutral";
  views: string;
}

export interface ChartArtist {
  title: string;
  browseId: string;
  subscribers: string;
  thumbnails: Thumbnail[];
  avatar: string;
  rank: string;
  trend: "up" | "down" | "neutral";
}

export interface Charts {
  countries: { selected: string; options: string[] };
  songs: ChartSong[];
  artists: ChartArtist[];
  genres?: { title: string; playlistId: string; cover: string }[];
}

export interface MoodCategory {
  title: string;
  params: string;
}

export interface MoodCategories {
  sections: { title: string; categories: MoodCategory[] }[];
}

export interface HomeRow {
  title: string;
  contents: (Song | Album | Artist | PlaylistSummary)[];
}

export type MixId = "on-repeat" | "discover" | "my-mix" | "fresh-finds";

export interface Mix {
  id: MixId;
  title: string;
  description: string;
  tracks: Song[];
}

export interface ProfileDTO {
  displayName: string;
  memberSince: string;
  counts: {
    liked: number;
    playlists: number;
    playedTracks: number;
    historyEntries: number;
  };
}
