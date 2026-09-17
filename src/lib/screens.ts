import { supabase, PLANS, type PlanId } from "./supabase";

const SLOT_STALE_MS = 120_000;
const DEVICE_KEY = "ttflix_screen_id";

export function maxScreensForPlan(plan: PlanId | string | null | undefined): number {
  return PLANS[(plan as PlanId) ?? "basic"]?.screens ?? 2;
}

export function screenLimitMessage(plan: PlanId | string | null | undefined, max: number): string {
  const planName = PLANS[(plan as PlanId) ?? "basic"]?.name ?? "your plan";
  const upgrade =
    plan === "basic" || plan === "basic_annual"
      ? " Upgrade to Premium for up to 5 screens."
      : "";
  return `${planName} allows ${max} screen${max === 1 ? "" : "s"} at a time. Sign out of another device first.${upgrade}`;
}

/** Stable per-install id. Token refresh must not create extra slots. */
export function deviceSessionId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "fallback-screen";
  }
}

function staleIso(ms = SLOT_STALE_MS): string {
  return new Date(Date.now() - ms).toISOString();
}

export async function liveSlotCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("active_watches")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("last_ping", staleIso());
  return count ?? 0;
}

export async function claimScreenSlot(args: {
  userId: string;
  plan: PlanId | string | null | undefined;
  tmdbId?: number | null;
  mediaType?: string | null;
  title?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; used: number; max: number }> {
  const sessionId = deviceSessionId();
  const max = maxScreensForPlan(args.plan);
  const now = new Date().toISOString();

  await supabase
    .from("active_watches")
    .delete()
    .eq("user_id", args.userId)
    .lt("last_ping", staleIso());

  const { data: existing } = await supabase
    .from("active_watches")
    .select("id")
    .eq("user_id", args.userId)
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existing?.id) {
    const patch: Record<string, unknown> = { last_ping: now };
    if (args.tmdbId != null) patch.tmdb_id = args.tmdbId;
    if (args.mediaType != null) patch.media_type = args.mediaType;
    if (args.title != null) patch.title = args.title;
    await supabase.from("active_watches").update(patch).eq("id", existing.id);
    return { ok: true, id: existing.id };
  }

  const used = await liveSlotCount(args.userId);
  if (used >= max) return { ok: false, used, max };

  const { data: inserted, error } = await supabase
    .from("active_watches")
    .insert({
      user_id: args.userId,
      session_id: sessionId,
      tmdb_id: args.tmdbId ?? null,
      media_type: args.mediaType ?? null,
      title: args.title ?? null,
      last_ping: now,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    const { data: raced } = await supabase
      .from("active_watches")
      .select("id")
      .eq("user_id", args.userId)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (raced?.id) return { ok: true, id: raced.id };
    return { ok: false, used, max };
  }

  const usedAfter = await liveSlotCount(args.userId);
  if (usedAfter > max) {
    await supabase.from("active_watches").delete().eq("id", inserted.id);
    return { ok: false, used: usedAfter - 1, max };
  }
  return { ok: true, id: inserted.id };
}

export async function pingScreenSlot(
  id: string,
  extra?: { tmdbId?: number; mediaType?: string; title?: string | null },
): Promise<void> {
  const patch: Record<string, unknown> = { last_ping: new Date().toISOString() };
  if (extra?.tmdbId != null) patch.tmdb_id = extra.tmdbId;
  if (extra?.mediaType != null) patch.media_type = extra.mediaType;
  if (extra && "title" in extra) patch.title = extra.title ?? null;
  await supabase.from("active_watches").update(patch).eq("id", id);
}

export async function stopPlayingOnSlot(id: string): Promise<void> {
  await supabase
    .from("active_watches")
    .update({ title: null, tmdb_id: null, media_type: null, last_ping: new Date().toISOString() })
    .eq("id", id);
}

export async function releaseScreenSlot(userId: string): Promise<void> {
  const sessionId = deviceSessionId();
  await supabase.from("active_watches").delete().eq("user_id", userId).eq("session_id", sessionId);
}
