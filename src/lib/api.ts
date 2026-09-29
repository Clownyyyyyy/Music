"use client";
/** Typed API client + TanStack Query hooks (server state). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  Album, Artist, Charts, HomeRow, HistoryDay, LyricsDTO, Mix, MoodCategories,
  PlaylistDetail, PlaylistSummary, ProfileDTO, Song,
} from "@/lib/types";

export const qk = {
  home: ["home"] as const,
  search: (q: string, f: string) => ["search", q, f] as const,
  suggestions: (q: string) => ["suggestions", q] as const,
  album: (id: string) => ["album", id] as const,
  artist: (id: string) => ["artist", id] as const,
  ytPlaylist: (id: string) => ["yt-playlist", id] as const,
  playlists: ["playlists"] as const,
  playlist: (id: string) => ["playlist", id] as const,
  liked: ["liked"] as const,
  history: ["history"] as const,
  moods: ["moods"] as const,
  moodPlaylists: (params: string) => ["mood-playlists", params] as const,
  charts: (country: string) => ["charts", country] as const,
  mixes: ["mixes"] as const,
  mix: (id: string) => ["mix", id] as const,
  recommendations: (seed: string) => ["recommendations", seed] as const,
  lyrics: (id: string) => ["lyrics", id] as const,
  profile: ["profile"] as const,
};

export interface SearchResponse {
  top: (Song | Album | Artist | PlaylistSummary) | null;
  songs: Song[];
  videos: Song[];
  albums: Album[];
  artists: Artist[];
  playlists: PlaylistSummary[];
}

export interface ArtistDetail extends Artist {
  description: string;
  subscribers: string | null;
  monthlyListeners: string | null;
  songs: { browseId: string | null; results: Song[] };
  albums: { results: Album[]; params: string | null; browseId: string | null };
  singles: { results: Album[] };
  videos: { results: Song[] };
  related: { results: Artist[] };
  radioSeed: string[];
  stats: { trackCount: number; views: string };
}

async function j<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json() as Promise<T>;
}

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `${res.status}`);
  return json as T;
}

// ---------------- queries (YouTube Music, real data) ----------------

export function useHome() {
  return useQuery({ queryKey: qk.home, queryFn: () => j<HomeRow[]>("/api/home?limit=5"), staleTime: 120_000 });
}

export function useSearch(q: string, filter: string = "") {
  return useQuery({
    queryKey: qk.search(q, filter),
    queryFn: () =>
      j<SearchResponse | SearchResponse["songs"] | Album[] | Artist[] | PlaylistSummary[]>(
        `/api/search?q=${encodeURIComponent(q)}${filter ? `&filter=${filter}` : ""}&limit=30`
      ),
    enabled: q.trim().length > 0,
  });
}

export function useSuggestions(q: string) {
  return useQuery({
    queryKey: qk.suggestions(q),
    queryFn: () => j<string[]>(`/api/suggestions?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });
}

export function useAlbum(id: string) {
  return useQuery({
    queryKey: qk.album(id),
    queryFn: () => j<Album & { tracks: Song[] }>(`/api/albums/${id}`),
    enabled: !!id,
  });
}

export function useArtist(id: string) {
  return useQuery({
    queryKey: qk.artist(id),
    queryFn: () => j<ArtistDetail>(`/api/artists/${id}`),
    enabled: !!id,
  });
}

/** Real public YouTube Music playlist. */
export function useYtPlaylist(id: string) {
  return useQuery({
    queryKey: qk.ytPlaylist(id),
    queryFn: () => j<PlaylistDetail>(`/api/yt-playlists/${id}?related=true`),
    enabled: !!id,
  });
}

export function useMoodCategories() {
  return useQuery({ queryKey: qk.moods, queryFn: () => j<MoodCategories>("/api/moods/categories"), staleTime: Infinity });
}

export function useMoodPlaylists(params: string) {
  return useQuery({
    queryKey: qk.moodPlaylists(params),
    queryFn: () => j<PlaylistSummary[]>(`/api/moods/playlists?params=${encodeURIComponent(params)}`),
    enabled: !!params,
  });
}

export function useCharts(country: string) {
  return useQuery({ queryKey: qk.charts(country), queryFn: () => j<Charts>(`/api/charts?country=${country}`), staleTime: 300_000 });
}

export function useMixes() {
  return useQuery({ queryKey: qk.mixes, queryFn: () => j<Mix[]>("/api/mixes"), staleTime: 60_000 });
}

export function useRecommendations(seed: string = "", limit = 25) {
  return useQuery({
    queryKey: [...qk.recommendations(seed), limit],
    queryFn: () => j<{ tracks: Song[]; context: { timeOfDay: string; sessionSongs: number; weights: Record<string, number> } }>(
      `/api/recommendations?seed=${seed}&limit=${limit}`
    ),
    staleTime: 60_000,
  });
}

export function useLyrics(songId: string | null) {
  return useQuery({
    queryKey: qk.lyrics(songId || "none"),
    queryFn: () => j<LyricsDTO | null>(`/api/lyrics/${songId}`),
    enabled: !!songId,
    staleTime: Infinity,
  });
}

// ---------------- local user data ----------------

export function usePlaylists() {
  return useQuery({ queryKey: qk.playlists, queryFn: () => j<PlaylistSummary[]>("/api/playlists") });
}

export function useLocalPlaylist(id: string) {
  return useQuery({
    queryKey: qk.playlist(id),
    queryFn: () => j<PlaylistDetail>(`/api/playlists/${id}`),
    enabled: !!id,
  });
}

export function useLiked() {
  return useQuery({ queryKey: qk.liked, queryFn: () => j<PlaylistDetail>("/api/liked") });
}

export function useHistory() {
  return useQuery({ queryKey: qk.history, queryFn: () => j<HistoryDay[]>("/api/history") });
}

export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: () => j<ProfileDTO>("/api/profile") });
}

// ---------------- mutations ----------------

export function useToggleLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ videoId, rating, track }: { videoId: string; rating: string; track?: Song }) =>
      send<{ status: string; liked: boolean }>("/api/liked", "POST", { videoId, rating, track }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.liked });
      qc.invalidateQueries({ queryKey: qk.mixes });
    },
  });
}

export function useCreatePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; description?: string; videoIds?: string[]; tracks?: Song[] }) =>
      send<{ playlistId: string }>("/api/playlists", "POST", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.playlists });
    },
  });
}

export function useEditPlaylist(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title?: string; description?: string }) =>
      send<{ status: string }>(`/api/playlists/${id}`, "PATCH", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.playlist(id) });
      qc.invalidateQueries({ queryKey: qk.playlists });
    },
  });
}

export function useDeletePlaylist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => send<{ status: string }>(`/api/playlists/${id}`, "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.playlists });
    },
  });
}

export function usePlaylistItems(id: string) {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qk.playlist(id) });
    qc.invalidateQueries({ queryKey: qk.playlists });
  };
  return {
    add: useMutation({
      mutationFn: (payload: { videoIds: string[]; tracks?: Song[] }) =>
        send(`/api/playlists/${id}/items`, "POST", payload),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (itemIds: string[]) => send(`/api/playlists/${id}/items`, "DELETE", { itemIds }),
      onSuccess: invalidate,
    }),
    reorder: useMutation({
      mutationFn: (order: string[]) => send(`/api/playlists/${id}/items`, "PATCH", { order }),
      onSuccess: invalidate,
    }),
  };
}

/** Plain (hook-free) playlist add for one-off UI flows. */
export async function addToPlaylist(playlistId: string, videoIds: string[], tracks?: Song[]) {
  return send<{ status: string }>(`/api/playlists/${playlistId}/items`, "POST", { videoIds, tracks });
}

export function useClearHistory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => send("/api/history?all=true", "DELETE"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.history });
      qc.invalidateQueries({ queryKey: qk.profile });
    },
  });
}

export function useRemoveHistoryItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => send(`/api/history?ids=${ids.join(",")}`, "DELETE"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.history }),
  });
}
