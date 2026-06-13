import { supabase } from "./supabase";

export type WatchProgress = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  backdrop_path: string | null;
  watched_seconds: number;
  duration_seconds: number;
  season?: number | null;
  episode?: number | null;
  updated_at?: string;
};

/** Save or update watch progress for a title */
export async function saveProgress(item: Omit<WatchProgress, "id" | "updated_at">) {
  await supabase.from("watch_progress").upsert(
    { ...item, updated_at: new Date().toISOString() },
    { onConflict: "user_id,tmdb_id,media_type" },
  );
}

/** Fetch the user's continue-watching list, most recent first */
export async function fetchContinueWatching(userId: string): Promise<WatchProgress[]> {
  const { data } = await supabase
    .from("watch_progress")
    .select("*")
    .eq("user_id", userId)
    .gt("watched_seconds", 30) // only show if they actually watched something
    .lt("duration_seconds", 0) // placeholder — overridden below
    .order("updated_at", { ascending: false })
    .limit(20);

  // filter: not finished (< 92% watched) — re-do without the broken lt above
  const { data: rows } = await supabase
    .from("watch_progress")
    .select("*")
    .eq("user_id", userId)
    .gt("watched_seconds", 30)
    .order("updated_at", { ascending: false })
    .limit(40);

  return ((rows as WatchProgress[]) ?? []).filter(
    (r) => r.duration_seconds <= 0 || r.watched_seconds / r.duration_seconds < 0.92,
  );
}

/** Remove a title from continue watching */
export async function removeProgress(userId: string, tmdbId: number, mediaType: string) {
  await supabase
    .from("watch_progress")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", tmdbId)
    .eq("media_type", mediaType);
}
