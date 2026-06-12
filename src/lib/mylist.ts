import { supabase } from "./supabase";

export type ListItem = {
  id?: string;
  user_id: string;
  tmdb_id: number;
  media_type: "movie" | "tv";
  title: string;
  poster_path: string | null;
};

export async function fetchMyList(userId: string) {
  const { data } = await supabase
    .from("my_list")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as ListItem[]) ?? [];
}

export async function addToList(item: ListItem) {
  await supabase.from("my_list").upsert(item, { onConflict: "user_id,tmdb_id,media_type" });
}

export async function removeFromList(userId: string, tmdbId: number, mediaType: string) {
  await supabase
    .from("my_list")
    .delete()
    .eq("user_id", userId)
    .eq("tmdb_id", tmdbId)
    .eq("media_type", mediaType);
}
