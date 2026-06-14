import { supabase } from "./supabase";

export type WatchProgress = {
  id?: string;
  user_id: string;
  profile_id: string;
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

export async function saveProgress(item: Omit<WatchProgress, "id" | "updated_at">) {
  const { error } = await supabase.from("watch_progress").upsert(
    { ...item, updated_at: new Date().toISOString() },
    { onConflict: "user_id,profile_id,tmdb_id,media_type" },
  );
  if (error) console.error("[saveProgress]", error.message, error.details);
}

export async function fetchContinueWatching(userId: string, profileId: string): Promise<WatchProgress[]> {
  const { data, error } = await supabase
    .from("watch_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .gte("watched_seconds", 5)
    .order("updated_at", { ascending: false })
    .limit(40);

  if (error) console.error("[fetchContinueWatching]", error.message);

  return ((data as WatchProgress[]) ?? []).filter(
    (r) => r.duration_seconds <= 0 || r.watched_seconds / r.duration_seconds < 0.92,
  );
}

export async function removeProgress(userId: string, profileId: string, tmdbId: number, mediaType: string) {
  await supabase
    .from("watch_progress")
    .delete()
    .eq("user_id", userId)
    .eq("profile_id", profileId)
    .eq("tmdb_id", tmdbId)
    .eq("media_type", mediaType);
}
