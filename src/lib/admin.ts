import { supabase, type UserStatus, ADMIN_EMAIL, type PlanId } from "./supabase";
import type { Profile } from "./auth";

export type AdminUser = Profile & {
  status: UserStatus;
  subscription_expires_at: string | null;
  pending_plan?: string | null;
};

export async function fetchUsersByStatus(status: UserStatus): Promise<AdminUser[]> {
  if (status === "pending") {
    // Pending = new sign-ups OR approved users within 5 days of expiry (renewal due)
    const fiveDaysFromNow = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .or(`status.eq.pending,and(status.eq.approved,subscription_expires_at.lte.${fiveDaysFromNow})`)
      .neq("email", ADMIN_EMAIL)
      .order("subscription_expires_at", { ascending: true });
    if (error) throw error;
    return (data as AdminUser[]) ?? [];
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("status", status)
    .neq("email", ADMIN_EMAIL)
    .order("email", { ascending: true });
  if (error) throw error;
  return (data as AdminUser[]) ?? [];
}

export async function countByStatus(status: UserStatus): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

export async function setUserStatus(id: string, status: UserStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    // Fetch current expiry and plan
    const { data: prof } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", id)
      .maybeSingle();

    const plan = (prof as any)?.plan ?? "basic";
    const amount = plan === "premium" ? 100 : 50;

    // Add exactly 1 calendar month from approval date
    const now = new Date();
    const periodStart = now.toISOString();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const periodEnd = nextMonth.toISOString();

    patch.subscription_expires_at = periodEnd;

    // Record the payment
    await supabase.from("payment_history").insert({
      user_id: id,
      plan,
      amount,
      period_start: periodStart,
      period_end: periodEnd,
    });
  }
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export type PaymentRecord = {
  id: string;
  user_id: string;
  approved_at: string;
  plan: string;
  amount: number;
  period_start: string;
  period_end: string;
  // joined from profiles
  full_name?: string | null;
  email?: string;
  phone?: string | null;
};

export async function fetchPaymentHistory(): Promise<PaymentRecord[]> {
  // Join payment_history with profiles to get user info
  const { data, error } = await supabase
    .from("payment_history")
    .select("*, profiles(full_name, email, phone)")
    .order("approved_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    full_name: r.profiles?.full_name ?? null,
    email: r.profiles?.email ?? "—",
    phone: r.profiles?.phone ?? null,
  }));
}

export async function deleteUserRecord(id: string) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

export async function requestPlanUpgrade(userId: string, newPlan: PlanId) {
  const { error } = await supabase
    .from("profiles")
    .update({ pending_plan: newPlan })
    .eq("id", userId);
  if (error) throw error;
}

export async function approvePlanUpgrade(userId: string) {
  // Fetch the pending plan
  const { data: prof } = await supabase
    .from("profiles")
    .select("pending_plan")
    .eq("id", userId)
    .maybeSingle();

  const newPlan = (prof as any)?.pending_plan as PlanId | null;
  if (!newPlan) return;

  const amount = newPlan === "premium" ? 100 : 50;
  const now = new Date();
  const periodStart = now.toISOString();
  const nextMonth = new Date(now);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const periodEnd = nextMonth.toISOString();

  await supabase.from("profiles").update({
    plan: newPlan,
    pending_plan: null,
    status: "approved",
    subscription_expires_at: periodEnd,
  }).eq("id", userId);

  await supabase.from("payment_history").insert({
    user_id: userId,
    plan: newPlan,
    amount,
    period_start: periodStart,
    period_end: periodEnd,
  });
}

export async function rejectPlanUpgrade(userId: string) {
  await supabase.from("profiles").update({ pending_plan: null }).eq("id", userId);
}

export async function fetchPendingUpgrades(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .not("pending_plan", "is", null)
    .neq("email", ADMIN_EMAIL)
    .order("email", { ascending: true });
  if (error) throw error;
  return (data as AdminUser[]) ?? [];
}

/**
 * Renewal lifecycle — called on every app load for the signed-in user.
 *
 * Rules:
 *  - 5 days before expiry:  set status → "pending"  (admin sees it, collects cash)
 *  - On/after expiry date:  set status → "suspended" (midnight cutoff)
 *
 * Admin is always exempt.
 */
export async function checkRenewal(userId: string, isAdmin: boolean): Promise<void> {
  if (isAdmin) return;

  const { data: prof } = await supabase
    .from("profiles")
    .select("status, subscription_expires_at")
    .eq("id", userId)
    .maybeSingle();

  if (!prof || !prof.subscription_expires_at) return;
  if (prof.status === "expelled") return;

  const now = Date.now();
  const expiresAt = new Date(prof.subscription_expires_at).getTime();

  // Past expiry midnight → suspend
  if (now >= expiresAt && prof.status !== "suspended") {
    await supabase.from("profiles").update({ status: "suspended" }).eq("id", userId);
  }
  // User stays "approved" and active during the 5-day window — do NOT change status
}
