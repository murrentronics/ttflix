import { supabase, PLANS, type UserStatus, ADMIN_EMAIL, type PlanId } from "./supabase";
import type { Profile } from "./auth";

/**
 * Calculate subscription expiry dates.
 *
 * Display date (shown to users/admin): last day of the subscription month at 23:59:59 local.
 * Actual expiry stored in DB: midnight on the 2nd of the following month (00:00:00 UTC).
 *
 * This gives admin the full 1st of the month to collect cash before anyone gets suspended.
 *
 * For annual plans, expiry is midnight on the 2nd day of the month one year later.
 */
function calcExpiry(startDate: Date, isAnnual: boolean): Date {
  const expiry = new Date(startDate);
  if (isAnnual) {
    expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  } else {
    expiry.setUTCMonth(expiry.getUTCMonth() + 1);
  }
  // Set to the 2nd of that month at 00:00:00 UTC — gives the full 1st for collection
  expiry.setUTCDate(2);
  expiry.setUTCHours(0, 0, 0, 0);
  return expiry;
}

/**
 * Format subscription_expires_at for display.
 * Shows the last day of the month (the DB stores the 2nd of next month as the cutoff).
 */
export function formatDueDate(expiresAt: string): Date {
  // DB stores expiry as 2026-08-02 00:00 UTC (midnight on the 2nd).
  // We show users the last day of their subscription month (e.g. 31 Jul 2026).
  // Silently the plan expires at 00:00 on the 2nd, giving admin all of the 1st
  // to collect cash before suspensions fire.
  const d = new Date(expiresAt);
  // Step back 1 day → lands on the 1st of the expiry month
  d.setUTCDate(d.getUTCDate() - 1);
  // Now find the last day of the subscription month (one month earlier)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0));
}

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
    // Fetch current profile including role, pending_plan and subscription_expires_at
    const { data: prof } = await supabase
      .from("profiles")
      .select("role, plan, pending_plan, subscription_expires_at")
      .eq("id", id)
      .maybeSingle();

    // Agents don't have subscriptions — skip payment record entirely
    if ((prof as any)?.role === "agent") {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      return;
    }

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
      .in("status", ["pending_admin", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // If the billing request was already approved by adminApproveAgentRequest,
    // that function already wrote the payment_history row and updated the profile.
    // Skip everything here to prevent a duplicate record.
    if ((billingRequest as any)?.status === "approved") {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
      return;
    }

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
    const periodEnd = calcExpiry(startDate, isAnnual);

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

    // Only insert if no payment record already covers this period for this user.
    // This prevents duplicates when adminApproveAgentRequest() already wrote the
    // record and the admin also clicks Approve on the same user in Pending Subs.
    const { count: existingCount } = await supabase
      .from("payment_history")
      .select("*", { count: "exact", head: true })
      .eq("user_id", id)
      .eq("period_start", periodStart);

    if ((existingCount ?? 0) === 0) {
      await supabase.from("payment_history").insert(paymentRecord);
    }
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
  agent_id?: string | null;
  agent_commission?: number | null;
  admin_amount?: number | null;
  agent_billing_request_id?: string | null;
  // joined from profiles
  full_name?: string | null;
  email?: string;
  phone?: string | null;
  // joined agent profile
  agent_name?: string | null;
  agent_email?: string | null;
};

export async function fetchPaymentHistory(page = 1, pageSize = 100): Promise<{ data: PaymentRecord[], count: number }> {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Step 1: fetch payment_history rows (no join — avoid RLS-dropping rows for deleted profiles)
  const { data, count, error } = await supabase
    .from("payment_history")
    .select("*", { count: "exact" })
    .order("approved_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return { data: [], count: 0 };

  // Step 2: collect unique user_ids and agent_ids, then bulk-fetch profiles
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
  const agentIds = [...new Set(rows.map((r) => r.agent_id).filter(Boolean))];
  const allIds = [...new Set([...userIds, ...agentIds])];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone")
    .in("id", allIds);

  const profileMap: Record<string, { full_name: string | null; email: string; phone: string | null }> = {};
  for (const p of (profiles ?? []) as any[]) {
    profileMap[p.id] = { full_name: p.full_name ?? null, email: p.email ?? "—", phone: p.phone ?? null };
  }

  return {
    data: rows.map((r) => ({
      ...r,
      full_name: profileMap[r.user_id]?.full_name ?? null,
      email: profileMap[r.user_id]?.email ?? "—",
      phone: profileMap[r.user_id]?.phone ?? null,
      agent_name: r.agent_id ? (profileMap[r.agent_id]?.full_name ?? null) : null,
      agent_email: r.agent_id ? (profileMap[r.agent_id]?.email ?? null) : null,
    })),
    count: count ?? 0,
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
  const periodEnd = calcExpiry(now, false);

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
  agent_phone?: string | null;
  customer_name?: string | null;
  customer_email?: string;
  customer_phone?: string | null;
};

export async function fetchPendingAgentBillingRequests(): Promise<AgentBillingRequestAdmin[]> {
  const { data, error } = await supabase
    .from("agent_billing_requests")
    .select(`
      *,
      agent:profiles!agent_billing_requests_agent_id_fkey(full_name, email, phone),
      customer:profiles!agent_billing_requests_customer_id_fkey(full_name, email, phone)
    `)
    .eq("status", "pending_admin")
    .order("agent_approved_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    agent_name: r.agent?.full_name ?? null,
    agent_email: r.agent?.email ?? "",
    agent_phone: r.agent?.phone ?? null,
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
  const periodEnd = calcExpiry(startDate, isAnnual);

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

  // 5) Add admin_amount to the agent's running balance (Collections page)
  await incrementAgentBalance(req.agent_id, req.admin_amount);
}

export async function adminRejectAgentRequest(requestId: string): Promise<void> {
  // Fetch the request to check type and get the customer_id
  const { data: req } = await supabase
    .from("agent_billing_requests")
    .select("customer_id, request_type")
    .eq("id", requestId)
    .maybeSingle();

  // Delete any payment history that might have been created for this request
  await supabase.from("payment_history").delete().eq("agent_billing_request_id", requestId);

  // Mark the request as rejected
  await supabase.from("agent_billing_requests").update({ status: "rejected" }).eq("id", requestId);

  // For new subscriptions — delete the customer entirely (they were never activated)
  if (req?.request_type === "new_subscription" && req?.customer_id) {
    // Remove agent link then delete the profile (cascades to auth user via DB)
    await supabase.from("agent_customers").delete().eq("customer_id", req.customer_id);
    await deleteUserRecord(req.customer_id);
  }
}

// ── Agent list with customer counts and monthly income ─────────────────────────
export type AgentListItem = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  status: string;
  customer_count: number;
  monthly_income: number;
  monthly_admin: number;
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
    .select("id, full_name, email, phone, status")
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
    status: a.status ?? "approved",
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

// ── Agent Collections — persistent balance tracking ───────────────────────────

export type AgentCollectionItem = {
  agent_id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  status: string;
  balance: number;          // current running balance owed to admin (TT$)
  updated_at: string;
  // breakdown for the current month
  this_month_admin: number; // admin_amount approved this calendar month
  all_time_owed: number;    // total admin_amount across all approved requests
  customer_count: number;
};

export async function fetchAgentCollections(): Promise<AgentCollectionItem[]> {
  // 1. All agent profiles
  const { data: agents, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, status")
    .eq("role", "agent")
    .order("full_name", { ascending: true });
  if (error) throw error;
  if (!agents || agents.length === 0) return [];

  const agentIds = (agents as any[]).map((a) => a.id);

  // 2. Persistent balances
  const { data: balances } = await supabase
    .from("agent_balance")
    .select("agent_id, balance, updated_at")
    .in("agent_id", agentIds);

  const balanceMap: Record<string, { balance: number; updated_at: string }> = {};
  for (const b of (balances ?? []) as any[]) {
    balanceMap[b.agent_id] = { balance: b.balance ?? 0, updated_at: b.updated_at };
  }

  // 3. All-time approved admin amounts per agent
  const { data: allApproved } = await supabase
    .from("agent_billing_requests")
    .select("agent_id, admin_amount")
    .eq("status", "approved")
    .in("agent_id", agentIds);

  const allTimeMap: Record<string, number> = {};
  for (const r of (allApproved ?? []) as any[]) {
    allTimeMap[r.agent_id] = (allTimeMap[r.agent_id] ?? 0) + (r.admin_amount ?? 0);
  }

  // 4. This month's approved admin amounts
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: monthApproved } = await supabase
    .from("agent_billing_requests")
    .select("agent_id, admin_amount")
    .eq("status", "approved")
    .gte("admin_approved_at", monthStart)
    .in("agent_id", agentIds);

  const monthMap: Record<string, number> = {};
  for (const r of (monthApproved ?? []) as any[]) {
    monthMap[r.agent_id] = (monthMap[r.agent_id] ?? 0) + (r.admin_amount ?? 0);
  }

  // 5. Customer counts
  const { data: links } = await supabase
    .from("agent_customers")
    .select("agent_id")
    .in("agent_id", agentIds);

  const countMap: Record<string, number> = {};
  for (const l of (links ?? []) as any[]) {
    countMap[l.agent_id] = (countMap[l.agent_id] ?? 0) + 1;
  }

  return (agents as any[]).map((a) => ({
    agent_id: a.id,
    full_name: a.full_name ?? null,
    email: a.email,
    phone: a.phone ?? null,
    status: a.status ?? "approved",
    balance: balanceMap[a.id]?.balance ?? 0,
    updated_at: balanceMap[a.id]?.updated_at ?? new Date().toISOString(),
    this_month_admin: monthMap[a.id] ?? 0,
    all_time_owed: allTimeMap[a.id] ?? 0,
    customer_count: countMap[a.id] ?? 0,
  }));
}

/**
 * Add an approved billing request's admin_amount to the agent's running balance.
 * Called automatically when admin approves a billing request.
 */
export async function incrementAgentBalance(agentId: string, adminAmount: number): Promise<void> {
  // Upsert: create row if missing, otherwise add to existing balance
  const { data: existing } = await supabase
    .from("agent_balance")
    .select("balance")
    .eq("agent_id", agentId)
    .maybeSingle();

  const newBalance = ((existing as any)?.balance ?? 0) + adminAmount;

  const { error } = await supabase
    .from("agent_balance")
    .upsert({ agent_id: agentId, balance: newBalance, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/**
 * Clear an agent's balance — admin calls this after physically collecting cash.
 * Records the cleared amount in agent_payments for audit trail.
 */
export async function clearAgentBalance(agentId: string, notes?: string): Promise<void> {
  // Get current balance first
  const { data: row } = await supabase
    .from("agent_balance")
    .select("balance")
    .eq("agent_id", agentId)
    .maybeSingle();

  const amount = (row as any)?.balance ?? 0;
  if (amount <= 0) return; // nothing to clear

  // Record the payment in the audit log
  const { error: payErr } = await supabase.from("agent_payments").insert({
    agent_id: agentId,
    amount,
    notes: notes ?? `Balance cleared by admin on ${new Date().toLocaleDateString("en-TT")}`,
  });
  if (payErr) throw payErr;

  // Zero out the balance
  const { error: balErr } = await supabase
    .from("agent_balance")
    .update({ balance: 0, updated_at: new Date().toISOString() })
    .eq("agent_id", agentId);
  if (balErr) throw balErr;
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
  const periodEnd = calcExpiry(now, false).toISOString();

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
  fullName: string;
  phone: string;
  adminEmail: string;
  adminPassword: string;
}): Promise<void> {
  const { email, fullName, phone, adminEmail, adminPassword } = args;
  const TEMP_PASSWORD = "123456";

  // Step 1: save the admin's current session so we can restore it after signUp
  const { data: sessionData } = await supabase.auth.getSession();
  const adminSession = sessionData.session;

  // Step 2: create the auth user (this signs us in as the new agent)
  const { data, error } = await supabase.auth.signUp({
    email,
    password: TEMP_PASSWORD,
    options: {
      data: { full_name: fullName, phone },
    },
  });
  if (error) throw error;

  const newUser = data.user;
  if (!newUser) throw new Error("User creation failed — no user returned.");

  // Step 3: upsert the profile as an agent while briefly signed in as them
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

  // Step 4: restore admin session
  if (adminSession?.access_token && adminSession?.refresh_token) {
    await supabase.auth.setSession({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    });
  } else {
    await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword });
  }
}

// NOTE: Run the following in Supabase SQL Editor to prevent duplicate
// payment_history rows at the database level and clean up any existing ones:
//
// -- Remove duplicate rows, keeping only the earliest per user+period_start
// DELETE FROM public.payment_history
// WHERE id NOT IN (
//   SELECT DISTINCT ON (user_id, period_start) id
//   FROM public.payment_history
//   ORDER BY user_id, period_start, approved_at ASC
// );
//
// -- Add unique constraint so duplicates are impossible going forward
// CREATE UNIQUE INDEX IF NOT EXISTS payment_history_user_period_unique
//   ON public.payment_history (user_id, period_start);
