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
    // Fetch current profile including pending_plan
    const { data: prof } = await supabase
      .from("profiles")
      .select("plan, pending_plan")
      .eq("id", id)
      .maybeSingle();

    const plan = ((prof as any)?.pending_plan ?? (prof as any)?.plan ?? "basic") as PlanId;
    const planDef = PLANS[plan];
    const amount = planDef?.price ?? 50;
    const isAnnual = planDef?.annual ?? false;

    const now = new Date();
    const periodStart = now.toISOString();
    const periodEnd = new Date(now);
    if (isAnnual) periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    patch.subscription_expires_at = periodEnd.toISOString();
    if ((prof as any)?.pending_plan) {
      patch.plan = plan;
      patch.pending_plan = null;
    }

    // Record the payment
    await supabase.from("payment_history").insert({
      user_id: id,
      plan,
      amount,
      period_start: periodStart,
      period_end: periodEnd.toISOString(),
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

// ── Agent role management ─────────────────────────────────────────────────────
export async function setUserRole(id: string, role: string | null) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) throw error;
}

// ── Agent billing requests (admin approval queue) ─────────────────────────────
export type AgentBillingRequestAdmin = {
  id: string;
  agent_id: string;
  customer_id: string;
  plan: string;
  amount: number;
  agent_commission: number;
  admin_amount: number;
  request_type: string;
  status: string;
  created_at: string;
  agent_approved_at: string | null;
  // joined
  agent_name?: string | null;
  agent_email?: string;
  customer_name?: string | null;
  customer_email?: string;
  customer_phone?: string | null;
};

export async function fetchPendingAgentBillingRequests(): Promise<AgentBillingRequestAdmin[]> {
  const { data, error } = await supabase
    .from("agent_billing_requests")
    .select(`
      *,
      agent:profiles!agent_billing_requests_agent_id_fkey(full_name, email),
      customer:profiles!agent_billing_requests_customer_id_fkey(full_name, email, phone)
    `)
    .eq("status", "pending_admin")
    .order("agent_approved_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    agent_name: r.agent?.full_name ?? null,
    agent_email: r.agent?.email ?? "",
    customer_name: r.customer?.full_name ?? null,
    customer_email: r.customer?.email ?? "",
    customer_phone: r.customer?.phone ?? null,
  }));
}

export async function adminApproveAgentRequest(requestId: string): Promise<void> {
  // 1. Fetch request details
  const { data: req } = await supabase
    .from("agent_billing_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found");

  const plan = req.plan as import("./supabase").PlanId;
  const customerId = req.customer_id;
  const isAnnual = plan === "basic_annual" || plan === "premium_annual";
  const now = new Date();
  const periodStart = now.toISOString();
  const periodEnd = new Date(now);
  if (isAnnual) periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  // 2. Activate customer
  await supabase.from("profiles").update({
    status: "approved",
    plan,
    subscription_expires_at: periodEnd.toISOString(),
    pending_plan: null,
  }).eq("id", customerId);

  // 3. Record payment with agent info
  await supabase.from("payment_history").insert({
    user_id: customerId,
    plan,
    amount: req.amount,
    period_start: periodStart,
    period_end: periodEnd.toISOString(),
    agent_id: req.agent_id,
    agent_commission: req.agent_commission,
    admin_amount: req.admin_amount,
  });

  // 4. Mark request as approved
  await supabase.from("agent_billing_requests").update({
    status: "approved",
    admin_approved_at: now.toISOString(),
  }).eq("id", requestId);
}

export async function adminRejectAgentRequest(requestId: string): Promise<void> {
  await supabase.from("agent_billing_requests").update({ status: "rejected" }).eq("id", requestId);
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
    .select("status, subscription_expires_at, role")
    .eq("id", userId)
    .maybeSingle();

  if (!prof || !prof.subscription_expires_at) return;
  if (prof.status === "expelled") return;
  if (prof.role === "agent") return; // agents don't have subscription expiry

  const now = Date.now();
  const expiresAt = new Date(prof.subscription_expires_at).getTime();

  // Past expiry midnight → suspend
  if (now >= expiresAt && prof.status !== "suspended") {
    await supabase.from("profiles").update({ status: "suspended" }).eq("id", userId);
  }
  // User stays "approved" and active during the 5-day window — do NOT change status
}
