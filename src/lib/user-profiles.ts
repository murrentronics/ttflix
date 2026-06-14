/**
 * Per-account sub-profiles (like Netflix profiles).
 * Stored in Supabase `user_profiles` table.
 * Each account has up to plan.screens profiles + 1 automatic Kids profile.
 */
import { supabase } from "./supabase";

export type UserProfile = {
  id: string;           // uuid
  user_id: string;      // auth user id
  name: string;
  is_kids: boolean;
  avatar_seed: string;  // seed for MonsterID avatar
  created_at?: string;
};

/** MonsterID avatar URL — deterministic from seed */
export function avatarUrl(seed: string, size = 120): string {
  return `https://www.gravatar.com/avatar/${btoa(seed).replace(/[^a-z0-9]/gi, "").slice(0, 32)}?d=monsterid&s=${size}&f=y`;
}

export async function fetchUserProfiles(userId: string): Promise<UserProfile[]> {
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  return (data as UserProfile[]) ?? [];
}

export async function createUserProfile(
  userId: string,
  name: string,
  isKids = false,
): Promise<UserProfile> {
  const seed = `${userId}-${name}-${Date.now()}`;
  const { data, error } = await supabase
    .from("user_profiles")
    .insert({ user_id: userId, name, is_kids: isKids, avatar_seed: seed })
    .select()
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function deleteUserProfile(profileId: string): Promise<void> {
  await supabase.from("user_profiles").delete().eq("id", profileId);
}

/** Ensure the Kids profile exists; create it if not. */
export async function ensureKidsProfile(userId: string): Promise<void> {
  const existing = await fetchUserProfiles(userId);
  if (!existing.some((p) => p.is_kids)) {
    await createUserProfile(userId, "Kids", true);
  }
}
