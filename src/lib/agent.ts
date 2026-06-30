import { supabase, PLANS, type PlanId } from "./supabase";

// ── Commission structure ──────────────────────────────────────────────────────
// basic monthly  TT$60:   agent $25, admin $35
// premium monthly TT$125: agent $50, admin $75
// basic annual TT$550:    agent $200, admin $350
// premium annual TT$750:  agent $300, admin $450
export const AGENT_COMMISSION: Record<PlanId, { agent: number; admin: number; total: number }> = {
  basic:           { agent: 25,  admin: 35,  total: 60  },
  premium:         { agent: 50,  admin: 75,  total: 125 },
  basic_annual:    { agent: 200, admin: 350, total: 550 },
  premium_annual:  { agent: 300, admin: 450, total: 750 },
};

export type AgentCustomer = {
  id: string;           // profiles.id
  email: string;
  full_name: string | null;
  phone: string | null;
  plan: PlanId;
  status: string;
  subscription_expires_at: string | null;
  // joined from agent_customers
  agent_customer_id: string;
  linked_at: string;
};

export type AgentBillingRequest = {
  id: string;
  agent_id: string;
  customer_id: string;
  plan: PlanId;
  amount: number;
  agent_commission: number;
  admin_amount: number;
  request_type: "new_subscription" | "renewal" | "plan_change";
  status: "pending_agent" | "pending_admin" | "approved" | "rejected";
  created_at: string;
  agent_approved_at: string | null;
  admin_approved_at: string | null;
  notes: string | null;
  // joined
  customer_full_name?: string | null;
  customer_email?: string;
  customer_phone?: string | null;
};

// Fetch all customers belonging to an agent, with their profile info
export async function fetchAgentCustomers(agentId: string): Promise<AgentCustomer[]> {
  const { data, error } = await supabase
    .from("agent_customers")
    .select("id, created_at, profiles!agent_customers_customer_id_fkey(*)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.profiles?.id,
    email: row.profiles?.email,
    full_name: row.profiles?.full_name ?? null,
    phone: row.profiles?.phone ?? null,
    plan: row.profiles?.plan,
    status: row.profiles?.status,
    subscription_expires_at: row.profiles?.subscription_expires_at ?? null,
    agent_customer_id: row.id,
    linked_at: row.created_at,
  }));
}

// Sign up a new customer (agent flow)
// Creates auth user + profile + links to agent
// The agent's session is preserved — they stay logged in after this call.
export async function agentCreateCustomer(
  agentId: string,
  agentEmail: string,
  agentPassword: string,
  data: {
    email: string;
    fullName: string;
    phone: string;
    plan: PlanId;
  }
): Promise<{ userId: string }> {
  const TEMP_PASSWORD = "123456";

  // 1. Save the agent's current session so we can restore it after signUp
  //    (Supabase client-side signUp auto-signs-in the new user, booting the agent)
  const { data: sessionData } = await supabase.auth.getSession();
  const agentSession = sessionData.session;

  // 2. Sign up the new customer
  const { data: authData, error: signUpErr } = await supabase.auth.signUp({
    email: data.email,
    password: TEMP_PASSWORD,
    options: {
      data: {
        full_name: data.fullName,
        phone: data.phone,
        country: "Trinidad & Tobago",
        plan: data.plan,
      },
    },
  });
  if (signUpErr) throw signUpErr;
  const newUser = authData.user;
  if (!newUser) throw new Error("User creation failed");

  // 3. Upsert profile row (we're briefly signed in as the new user — that's fine,
  //    the upsert uses newUser.id so RLS (id = auth.uid()) passes)
  const { error: profileErr } = await supabase.from("profiles").upsert({
    id: newUser.id,
    email: data.email.toLowerCase(),
    full_name: data.fullName,
    phone: data.phone,
    country: "Trinidad & Tobago",
    plan: data.plan,
    status: "pending",
  });
  if (profileErr) throw profileErr;

  // 4. Restore agent session immediately
  if (agentSession?.access_token && agentSession?.refresh_token) {
    await supabase.auth.setSession({
      access_token: agentSession.access_token,
      refresh_token: agentSession.refresh_token,
    });
  } else {
    // Fallback: re-sign in with agent credentials
    await supabase.auth.signInWithPassword({ email: agentEmail, password: agentPassword });
  }

  // 5. Now signed in as agent — link customer and create billing request
  const { error: linkErr } = await supabase.from("agent_customers").insert({
    agent_id: agentId,
    customer_id: newUser.id,
  });
  if (linkErr) throw linkErr;

  // 6. Create billing request directly at pending_admin — cash collected at signup
  const commission = AGENT_COMMISSION[data.plan];
  const now = new Date().toISOString();
  await supabase.from("agent_billing_requests").insert({
    agent_id: agentId,
    customer_id: newUser.id,
    plan: data.plan,
    amount: commission.total,
    agent_commission: commission.agent,
    admin_amount: commission.admin,
    request_type: "new_subscription",
    status: "pending_admin",
    agent_approved_at: now,
  });

  return { userId: newUser.id };
}

// Agent approves a billing request (confirms they collected cash)
export async function agentApproveBillingRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from("agent_billing_requests")
    .update({
      status: "pending_admin",
      agent_approved_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) throw error;

  // Also set the customer profile to pending so admin sees it
  const { data: req } = await supabase
    .from("agent_billing_requests")
    .select("customer_id")
    .eq("id", requestId)
    .maybeSingle();

  if (req?.customer_id) {
    await supabase
      .from("profiles")
      .update({ status: "pending" })
      .eq("id", req.customer_id);
  }
}

// Fetch agent's billing requests
export async function fetchAgentBillingRequests(agentId: string): Promise<AgentBillingRequest[]> {
  const { data, error } = await supabase
    .from("agent_billing_requests")
    .select("*, profiles!agent_billing_requests_customer_id_fkey(full_name, email, phone)")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    customer_full_name: r.profiles?.full_name ?? null,
    customer_email: r.profiles?.email ?? "",
    customer_phone: r.profiles?.phone ?? null,
  }));
}

// Fetch payment history for a specific customer (agent view — read-only)
export async function fetchCustomerPaymentHistory(customerId: string) {
  const { data, error } = await supabase
    .from("payment_history")
    .select("*")
    .eq("user_id", customerId)
    .order("approved_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    approved_at: string;
    plan: string;
    amount: number;
    period_start: string;
    period_end: string;
    agent_commission?: number;
    admin_amount?: number;
  }>;
}

// Get pending billing requests that need agent approval (new_subscription or renewal)
export async function fetchPendingAgentApprovals(agentId: string): Promise<AgentBillingRequest[]> {
  const { data, error } = await supabase
    .from("agent_billing_requests")
    .select("*, profiles!agent_billing_requests_customer_id_fkey(full_name, email, phone)")
    .eq("agent_id", agentId)
    .eq("status", "pending_agent")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    customer_full_name: r.profiles?.full_name ?? null,
    customer_email: r.profiles?.email ?? "",
    customer_phone: r.profiles?.phone ?? null,
  }));
}

// Get upcoming renewals for the agent's customers (within 5 days)
export async function fetchAgentUpcomingRenewals(agentId: string): Promise<AgentCustomer[]> {
  const in5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("agent_customers")
    .select("id, created_at, profiles!agent_customers_customer_id_fkey(*)")
    .eq("agent_id", agentId);

  if (error) throw error;

  return ((data ?? []) as any[])
    .map((row) => ({
      id: row.profiles?.id,
      email: row.profiles?.email,
      full_name: row.profiles?.full_name ?? null,
      phone: row.profiles?.phone ?? null,
      plan: row.profiles?.plan,
      status: row.profiles?.status,
      subscription_expires_at: row.profiles?.subscription_expires_at ?? null,
      agent_customer_id: row.id,
      linked_at: row.created_at,
    }))
    .filter((c: AgentCustomer) => {
      if (!c.subscription_expires_at) return false;
      const exp = c.subscription_expires_at;
      return exp >= now && exp <= in5Days;
    });
}

// Create a renewal billing request for an agent customer — directly pending admin
export async function agentRequestRenewal(
  agentId: string,
  customerId: string,
  plan: PlanId
): Promise<void> {
  const commission = AGENT_COMMISSION[plan];
  const now = new Date().toISOString();
  const { error } = await supabase.from("agent_billing_requests").insert({
    agent_id: agentId,
    customer_id: customerId,
    plan,
    amount: commission.total,
    agent_commission: commission.agent,
    admin_amount: commission.admin,
    request_type: "renewal",
    status: "pending_admin",
    agent_approved_at: now,
  });
  if (error) throw error;
  
  // Mark customer as pending so admin sees them in pending tab
  await supabase.from("profiles").update({ status: "pending" }).eq("id", customerId);
}

// One-step pay: agent has collected cash and immediately submits to admin queue.
// Creates the renewal request already at pending_admin (no separate confirm step).
export async function agentPayAndSubmitRenewal(
  agentId: string,
  customerId: string,
  plan: PlanId
): Promise<void> {
  const commission = AGENT_COMMISSION[plan];
  const now = new Date().toISOString();

  // Insert request directly as pending_admin — cash already collected
  const { data: req, error } = await supabase
    .from("agent_billing_requests")
    .insert({
      agent_id: agentId,
      customer_id: customerId,
      plan,
      amount: commission.total,
      agent_commission: commission.agent,
      admin_amount: commission.admin,
      request_type: "renewal",
      status: "pending_admin",
      agent_approved_at: now,
    })
    .select("id")
    .maybeSingle();
  if (error) throw error;

  // Mark customer as pending so admin sees them in the pending tab
  await supabase
    .from("profiles")
    .update({ status: "pending" })
    .eq("id", customerId);
}

// Calculate agent summary stats
export async function fetchAgentSummary(agentId: string) {
  // Total commission earned (approved requests)
  const { data: approved } = await supabase
    .from("agent_billing_requests")
    .select("agent_commission, admin_amount, amount")
    .eq("agent_id", agentId)
    .eq("status", "approved");

  const totalCommission = (approved ?? []).reduce((s: number, r: any) => s + (r.agent_commission ?? 0), 0);
  const totalAdminAmount = (approved ?? []).reduce((s: number, r: any) => s + (r.admin_amount ?? 0), 0);

  // Pending collections (pending_admin = agent approved, waiting for admin)
  const { data: pendingAdmin } = await supabase
    .from("agent_billing_requests")
    .select("amount, agent_commission, admin_amount")
    .eq("agent_id", agentId)
    .eq("status", "pending_admin");

  const pendingCollection = (pendingAdmin ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const pendingAgentCut = (pendingAdmin ?? []).reduce((s: number, r: any) => s + (r.agent_commission ?? 0), 0);
  const pendingAdminCut = (pendingAdmin ?? []).reduce((s: number, r: any) => s + (r.admin_amount ?? 0), 0);

  return {
    totalCommission,
    totalAdminAmount,
    pendingCollection,
    pendingAgentCut,
    pendingAdminCut,
  };
}
