import { supabase, PLANS, type UserStatus, ADMIN_EMAIL, type PlanId } from "./supabase";
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
    let query = supabase
      .from("profiles")
      .select("*")
      .or(`status.eq.pending,and(status.eq.approved,subscription_expires_at.lte.${fiveDaysFromNow})`)
      .neq("email", ADMIN_EMAIL)
      .order("subscription_expires_at", { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return (data as AdminUser[]) ?? [];
  }

  let query = supabase
    .from("profiles")
    .select("*")
    .eq("status", status)
    .neq("email", ADMIN_EMAIL)
    .order("email", { ascending: true });

  // For approved status, exclude agents (only if role is actually agent; if role is null or doesn't exist, include them)
  if (status === "approved") {
    query = query.or("role.is.null,role.neq.agent");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as AdminUser[]) ?? [];
}

export async function countByStatus(status: UserStatus): Promise<number> {
  let query = supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", status)
    .neq("email", ADMIN_EMAIL); // Don't forget to exclude admin!

  // For approved status, exclude agents (only if role is actually agent; if role is null or doesn't exist, include them)
  if (status === "approved") {
    query = query.or("role.is.null,role.neq.agent");
  }

  const { count } = await query;
  return count ?? 0;
}

export async function setUserStatus(id: string, status: UserStatus) {
  const patch: Record<string, unknown> = { status };
  if (status === "approved") {
    // Fetch current profile including pending_plan and subscription_expires_at
    const { data: prof } = await supabase
      .from("profiles")
      .select("plan, pending_plan, subscription_expires_at")
      .eq("id", id)
      .maybeSingle();

    // Check if user has an agent
    const { data: agentCustomerLink } = await supabase
      .from("agent_customers")
      .select("agent_id")
      .eq("customer_id", id)
      .maybeSingle();

    // Check if there's a pending agent billing request for this user
    const { data: billingRequest } = await supabase
      .from("agent_billing_requests")
      .select("*")
      .eq("customer_id", id)
      .eq("status", "pending_admin")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const plan = ((prof as any)?.pending_plan ?? (prof as any)?.plan ?? "basic") as PlanId;
    const planDef = PLANS[plan];
    const isAnnual = planDef?.annual ?? false;

    const now = new Date();

    // Calculate start date: if current subscription exists and is in future, start from there; otherwise start from now
    let startDate = now;
    if ((prof as any)?.subscription_expires_at) {
      const currentExpiry = new Date((prof as any).subscription_expires_at);
      if (currentExpiry > now) {
        startDate = currentExpiry;
      }
    }

    const periodStart = startDate.toISOString();
    const periodEnd = new Date(startDate);
    if (isAnnual) periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    else periodEnd.setMonth(periodEnd.getMonth() + 1);

    patch.subscription_expires_at = periodEnd.toISOString();
    if ((prof as any)?.pending_plan) {
      patch.plan = plan;
      patch.pending_plan = null;
    }

    // Record the payment
    const paymentRecord: any = {
      user_id: id,
      plan,
      amount: billingRequest?.amount ?? planDef?.price ?? 50,
      period_start: periodStart,
      period_end: periodEnd.toISOString(),
      approved_at: now.toISOString(),
    };

    // Add agent info if applicable
    if (agentCustomerLink?.agent_id) {
      paymentRecord.agent_id = agentCustomerLink.agent_id;
      paymentRecord.agent_commission = billingRequest?.agent_commission;
      paymentRecord.admin_amount = billingRequest?.admin_amount;
    }

    if (billingRequest?.id) {
      paymentRecord.agent_billing_request_id = billingRequest.id;
    }

    await supabase.from("payment_history").insert(paymentRecord);
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

export async function fetchPaymentHistory(page = 1, pageSize = 100): Promise<{ data: PaymentRecord[], count: number }> {
  // Join payment_history with profiles to get user info
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count, error } = await supabase
    .from("payment_history")
    .select("*, profiles(full_name, email, phone)", { count: "exact" })
    .order("approved_at", { ascending: false })
    .range(from, to);
  if (error) throw error;
  return {
    data: ((data ?? []) as any[]).map((r) => ({
      ...r,
      full_name: r.profiles?.full_name ?? null,
      email: r.profiles?.email ?? "—",
      phone: r.profiles?.phone ?? null,
    })),
    count: count ?? 0
  };
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

/**
 * Promote a subscriber to agent:
 * - Sets role = "agent"
 * - Clears subscription_expires_at, pending_plan, plan
 * - Sets status = "approved" (agents are always active, no subscription needed)
 */
export async function makeUserAgent(id: string) {
  const { error } = await supabase.from("profiles").update({
    role: "agent",
    subscription_expires_at: null,
    pending_plan: null,
    plan: null,
  }).eq("id", id);
  if (error) throw error;
}

/**
 * Revert an agent back to a regular subscriber:
 * - Clears role (null = regular user)
 * - Restores basic plan with a fresh 30-day subscription
 * - Status stays "approved" so they are immediately active
 */
export async function removeUserAgent(id: string) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error } = await supabase.from("profiles").update({
    role: null,
    plan: "basic",
    subscription_expires_at: periodEnd.toISOString(),
    pending_plan: null,
    status: "approved",
  }).eq("id", id);
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
  // 1) Fetch request details AND customer profile
  const { data: req } = await supabase
    .from("agent_billing_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) throw new Error("Request not found");

  const customerId = req.customer_id;
  const { data: customerProfile } = await supabase
    .from("profiles")
    .select("subscription_expires_at")
    .eq("id", customerId)
    .maybeSingle();

  const plan = req.plan as import("./supabase").PlanId;
  const isAnnual = plan === "basic_annual" || plan === "premium_annual";
  const now = new Date();

  // Calculate start date: if current subscription exists and is in future, start from there; otherwise start from now
  let startDate = now;
  if (customerProfile?.subscription_expires_at) {
    const currentExpiry = new Date(customerProfile.subscription_expires_at);
    if (currentExpiry > now) {
      startDate = currentExpiry;
    }
  }

  const periodStart = startDate.toISOString();
  const periodEnd = new Date(startDate);
  if (isAnnual) periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  // 2) Activate/extend customer
  await supabase.from("profiles").update({
    status: "approved",
    plan,
    subscription_expires_at: periodEnd.toISOString(),
    pending_plan: null,
  }).eq("id", customerId);

  // 3) Record payment with agent info
  await supabase.from("payment_history").insert({
    user_id: customerId,
    plan,
    amount: req.amount,
    period_start: periodStart,
    period_end: periodEnd.toISOString(),
    agent_id: req.agent_id,
    agent_commission: req.agent_commission,
    admin_amount: req.admin_amount,
    approved_at: now.toISOString(),
    agent_billing_request_id: requestId, // Link payment to the billing request
  });

  // 4) Mark request as approved
  await supabase.from("agent_billing_requests").update({
    status: "approved",
    admin_approved_at: now.toISOString(),
  }).eq("id", requestId);
}

export async function adminRejectAgentRequest(requestId: string): Promise<void> {
  // First, delete any payment history that might have been created for this request
  await supabase.from("payment_history").delete().eq("agent_billing_request_id", requestId);
  // Then mark the request as rejected
  await supabase.from("agent_billing_requests").update({ status: "rejected" }).eq("id", requestId);
}

// ── Agent list with customer counts and monthly income ─────────────────────────
export type AgentListItem = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  customer_count: number;
  monthly_income: number;   // total collected from agent's customers this month
  monthly_admin: number;    // admin's portion from agent's customers this month
  customers: Array<{
    id: string;
    full_name: string | null;
    email: string;
    phone: string | null;
    plan: string;
    status: string;
    subscription_expires_at: string | null;
  }>;
};

export async function fetchAgentList(): Promise<AgentListItem[]> {
  // Fetch all agent profiles
  const { data: agents, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("role", "agent")
    .neq("email", ADMIN_EMAIL)
    .order("full_name", { ascending: true });
  if (error) throw error;
  if (!agents || agents.length === 0) return [];

  // Fetch agent_customers with customer profiles for all agents
  const { data: links } = await supabase
    .from("agent_customers")
    .select("agent_id, profiles!agent_customers_customer_id_fkey(id, full_name, email, phone, plan, status, subscription_expires_at)")
    .in("agent_id", (agents as any[]).map((a) => a.id));

  // Fetch approved billing requests to compute monthly income
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const { data: approved } = await supabase
    .from("agent_billing_requests")
    .select("agent_id, agent_commission, admin_amount, amount")
    .eq("status", "approved")
    .gte("admin_approved_at", monthStart);

  const linksByAgent: Record<string, any[]> = {};
  for (const link of (links ?? []) as any[]) {
    if (!linksByAgent[link.agent_id]) linksByAgent[link.agent_id] = [];
    if (link.profiles) linksByAgent[link.agent_id].push(link.profiles);
  }

  const incomeByAgent: Record<string, { income: number; admin: number }> = {};
  for (const row of (approved ?? []) as any[]) {
    if (!incomeByAgent[row.agent_id]) incomeByAgent[row.agent_id] = { income: 0, admin: 0 };
    incomeByAgent[row.agent_id].income += row.agent_commission ?? 0;
    incomeByAgent[row.agent_id].admin += row.admin_amount ?? 0;
  }

  return (agents as any[]).map((a) => ({
    id: a.id,
    full_name: a.full_name ?? null,
    email: a.email,
    phone: a.phone ?? null,
    customer_count: (linksByAgent[a.id] ?? []).length,
    monthly_income: incomeByAgent[a.id]?.income ?? 0,
    monthly_admin: incomeByAgent[a.id]?.admin ?? 0,
    customers: linksByAgent[a.id] ?? [],
  }));
}

// Fetch agent_customers links for pending/approved user rows (to show agent badge)
export async function fetchAgentCustomerLinks(): Promise<Record<string, { agent_id: string; agent_name: string | null; agent_email: string }>> {
  const { data } = await supabase
    .from("agent_customers")
    .select("agent_id, customer_id, profiles!agent_customers_agent_id_fkey(full_name, email)");
  const map: Record<string, { agent_id: string; agent_name: string | null; agent_email: string }> = {};
  for (const row of (data ?? []) as any[]) {
    map[row.customer_id] = {
      agent_id: row.agent_id,
      agent_name: row.profiles?.full_name ?? null,
      agent_email: row.profiles?.email ?? "",
    };
  }
  return map;
}

// ── Agent payment tracking (admin records cash received from agent) ────────────
export type AgentOwedSummary = {
  agent_id: string;
  full_name: string | null;
  email: string;
  total_owed: number;      // sum of admin_amount on approved requests
  total_paid: number;      // sum of recorded payments
  balance_due: number;     // total_owed - total_paid
};

export async function fetchAgentOwedSummaries(): Promise<AgentOwedSummary[]> {
  // All approved agent billing requests
  const { data: requests } = await supabase
    .from("agent_billing_requests")
    .select("agent_id, admin_amount, profiles!agent_billing_requests_agent_id_fkey(id, full_name, email)")
    .eq("status", "approved");

  // All recorded agent payments
  const { data: payments } = await supabase
    .from("agent_payments")
    .select("agent_id, amount");

  // Aggregate owed per agent
  const owedMap: Record<string, { owed: number; name: string | null; email: string }> = {};
  for (const r of (requests ?? []) as any[]) {
    if (!owedMap[r.agent_id]) {
      owedMap[r.agent_id] = {
        owed: 0,
        name: r.profiles?.full_name ?? null,
        email: r.profiles?.email ?? "",
      };
    }
    owedMap[r.agent_id].owed += r.admin_amount ?? 0;
  }

  // Aggregate paid per agent
  const paidMap: Record<string, number> = {};
  for (const p of (payments ?? []) as any[]) {
    paidMap[p.agent_id] = (paidMap[p.agent_id] ?? 0) + (p.amount ?? 0);
  }

  return Object.entries(owedMap).map(([agentId, info]) => ({
    agent_id: agentId,
    full_name: info.name,
    email: info.email,
    total_owed: info.owed,
    total_paid: paidMap[agentId] ?? 0,
    balance_due: info.owed - (paidMap[agentId] ?? 0),
  }));
}

export async function recordAgentPayment(agentId: string, amount: number, notes?: string): Promise<void> {
  const { error } = await supabase.from("agent_payments").insert({
    agent_id: agentId,
    amount,
    notes: notes ?? null,
  });
  if (error) throw error;
}

// ── Dashboard summary stats ───────────────────────────────────────────────────
export type DashboardStats = {
  totalSubscribers: number;
  totalAgents: number;
  totalMonthlyRevenue: number;
  totalYearlyRevenue: number;
  totalAdminIncome: number; // all time admin net income
  adminMonthlyIncome: number;  // admin's net (excludes agent commissions)
  liveWatchingCount: number;
  pendingAgentRequestsCount: number;
  pendingSubscribersCount: number;
};

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // Active subscribers with their plans (exclude agents and admin)
  // NOTE: .neq("role","agent") misses rows where role IS NULL in Postgres,
  //       so we use .or() to capture nulls correctly.
  const { data: subs } = await supabase
    .from("profiles")
    .select("id, plan, role")
    .eq("status", "approved")
    .neq("email", ADMIN_EMAIL)
    .or("role.is.null,role.neq.agent");

  // All payment history ever
  const { data: allPayments } = await supabase
    .from("payment_history")
    .select("*");

  // Count agents
  const { count: agentCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "agent");

  // Count live watching (last 30 seconds)
  const staleDate = new Date(Date.now() - 30 * 1000).toISOString();
  const { count: watchingCount } = await supabase
    .from("active_watches")
    .select("*", { count: "exact", head: true })
    .gte("last_ping", staleDate);

  // Count pending agent requests
  const { count: pendingRequestsCount } = await supabase
    .from("agent_billing_requests")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending_admin");

  // Count pending subscribers
  const { count: pendingSubsCount } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");

  const subList = (subs ?? []) as any[];
  const allPayList = (allPayments ?? []) as any[];

  // Calculate monthly and yearly revenue from active subs
  let totalMonthlyRevenue = 0;
  let totalYearlyRevenue = 0;
  for (const sub of subList) {
    const planId = sub.plan ?? "basic";
    const planDef = PLANS[planId as PlanId];
    const price = planDef?.price ?? 0;
    if (planDef?.annual) {
      totalMonthlyRevenue += Math.round(price / 12);
      totalYearlyRevenue += price;
    } else {
      totalMonthlyRevenue += price;
      totalYearlyRevenue += price * 12;
    }
  }

  // Admin's total all time income
  let totalAdminIncome = 0;
  let adminMonthlyIncome = 0;
  for (const p of allPayList) {
    const agentComm = p.agent_commission ?? 0;
    const adminPart = p.admin_amount ?? (p.amount - agentComm);
    totalAdminIncome += adminPart;
    // Also check if payment is this month
    if (p.approved_at && new Date(p.approved_at) >= new Date(monthStart)) {
      adminMonthlyIncome += adminPart;
    }
  }

  return {
    totalSubscribers: subList.length,
    totalAgents: agentCount ?? 0,
    totalMonthlyRevenue,
    totalYearlyRevenue,
    totalAdminIncome,
    adminMonthlyIncome,
    liveWatchingCount: watchingCount ?? 0,
    pendingAgentRequestsCount: pendingRequestsCount ?? 0,
    pendingSubscribersCount: pendingSubsCount ?? 0,
  };
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
    approved_at: now.toISOString(),
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

// ── Admin: create a new agent account directly ────────────────────────────────
/**
 * Creates a Supabase auth user + profile with role="agent", status="approved",
 * and no plan/subscription. Only callable server-side via service-role key, so
 * we use a Supabase Edge Function ("admin-create-agent") to do the heavy lifting
 * and keep the service-role key off the client.
 *
 * Falls back to a two-step approach using the anon key:
 *   1. signUp (creates auth user)
 *   2. upsert profile with agent role
 *
 * NOTE: Because Supabase anon signUp requires email confirmation by default,
 * this approach works only when "Email confirmations" is DISABLED in the
 * Supabase Auth settings (which is the case for this project since agents use
 * a temp password set by admin and change it on first login).
 */
export async function adminCreateAgent(args: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
}): Promise<void> {
  const { email, password, fullName, phone } = args;

  // Step 1: create the auth user via signUp
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
    },
  });
  if (error) throw error;

  const newUser = data.user;
  if (!newUser) throw new Error("User creation failed — no user returned.");

  // Step 2: upsert the profile as an agent (no plan, no subscription)
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: newUser.id,
    email,
    full_name: fullName,
    phone,
    country: "Trinidad & Tobago",
    plan: null,
    status: "approved",
    role: "agent",
    subscription_expires_at: null,
    pending_plan: null,
  });
  if (profileError) throw profileError;
}
