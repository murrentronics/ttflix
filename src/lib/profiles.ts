import { supabase } from "./supabase";
import { PLANS, type PlanId } from "./supabase";

export type UserProfile = {
  id: string;
  user_id: string;
  name: string;
  avatar_color: string;
  is_kids: boolean;
  is_default: boolean;
  created_at: string;
};

const AVATAR_COLORS = [
  "#E50914", "#0071EB", "#E87C03", "#54B9C5", "#8B5CF6",
  "#EC4899", "#10B981", "#F59E0B",
];

export function randomColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

export function maxProfiles(plan: PlanId): number {
  // Standard (2 screens) → 3 profiles, Premium (5 screens) → 6 profiles
  const screens = PLANS[plan]?.screens ?? 2;
  return screens === 5 ? 6 : 3;
}

export async function fetchProfiles(userId: string): Promise<UserProfile[]> {
  const { data } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  const all = (data as UserProfile[]) ?? [];

  // Auto-clean duplicate DEFAULT profiles only (there must only ever be one).
  // Kids profiles are NOT deduplicated — users can have multiple kids profiles.
  const defaultProfiles = all.filter((p) => p.is_default);
  const toDelete: string[] = defaultProfiles.slice(0, -1).map((p) => p.id);

  if (toDelete.length > 0) {
    supabase.from("user_profiles").delete().in("id", toDelete).then(() => {});
  }

  const deleteSet = new Set(toDelete);
  const cleaned = all.filter((p) => !deleteSet.has(p.id));
  
  // Sort profiles: Default first, then non-kids, then Kids always last
  return cleaned.sort((a, b) => {
    if (a.is_default) return -1;
    if (b.is_default) return 1;
    if (a.is_kids && !b.is_kids) return 1;
    if (!a.is_kids && b.is_kids) return -1;
    // For non-kids/non-default: sort by created_at
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

export async function createProfile(
  userId: string,
  name: string,
  options: { isKids?: boolean; isDefault?: boolean; color?: string } = {}
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      name,
      avatar_color: options.color ?? randomColor(),
      is_kids: options.isKids ?? false,
      is_default: options.isDefault ?? false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function updateProfile(
  profileId: string,
  updates: { name?: string; avatar_color?: string }
): Promise<void> {
  const { error } = await supabase.from("user_profiles").update(updates).eq("id", profileId);
  if (error) throw error;
}

export async function deleteProfile(profileId: string): Promise<void> {
  await supabase.from("user_profiles").delete().eq("id", profileId);
}

/** Ensure default + kids profiles exist for a new user. Called after sign-in. */
export async function ensureDefaultProfiles(
  userId: string,
  userName: string,
  plan: PlanId
): Promise<UserProfile[]> {
  const existing = await fetchProfiles(userId);

  const hasDefault = existing.some((p) => p.is_default);
  const hasKids = existing.some((p) => p.is_kids);

  if (!hasDefault) {
    await createProfile(userId, userName || "Me", { isDefault: true, color: "#E50914" });
  }
  if (!hasKids) {
    await createProfile(userId, "Kids", { isKids: true, color: "#0071EB" });
  }

  if (hasDefault && hasKids) return existing;
  return fetchProfiles(userId);
}
