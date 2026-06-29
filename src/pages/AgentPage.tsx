import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, TrendingUp, Clock, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, X, Check, Phone, Mail,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase, PLANS, type PlanId } from "@/lib/supabase";
import {
  fetchAgentCustomers, agentCreateCustomer, agentApproveBillingRequest,
  fetchAgentBillingRequests, fetchAgentSummary, fetchAgentUpcomingRenewals,
  agentRequestRenewal, fetchCustomerPaymentHistory,
  AGENT_COMMISSION, type AgentCustomer, type AgentBillingRequest,
} from "@/lib/agent";

type AgentTab = "create" | "customers" | "approvals" | "renewals";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function AgentPage() {
  const { user, profile, loading, isAgent, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AgentTab>("create");
  const [customers, setCustomers] = useState<AgentCustomer[]>([]);
  const [billingRequests, setBillingRequests] = useState<AgentBillingRequest[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<AgentCustomer[]>([]);
  const [summary, setSummary] = useState({ totalCommission: 0, totalAdminAmount: 0, pendingCollection: 0, pendingAgentCut: 0, pendingAdminCut: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  // Create customer form
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPlan, setCreatePlan] = useState<PlanId>("basic");
  const [creating, setCreating] = useState(false);
  const [createDone, setCreateDone] = useState(false);

  // Customer detail modal
  const [selectedCustomer, setSelectedCustomer] = useState<AgentCustomer | null>(null);
  const [customerHistory, setCustomerHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/auth");
    if (!loading && user && !isAgent && !isAdmin) navigate("/");
  }, [loading, user, isAgent, isAdmin, navigate]);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [c, r, s, u] = await Promise.all([
      fetchAgentCustomers(user.id),
      fetchAgentBillingRequests(user.id),
      fetchAgentSummary(user.id),
      fetchAgentUpcomingRenewals(user.id),
    ]);
    setCustomers(c);
    setBillingRequests(r);
    setSummary(s);
    setUpcomingRenewals(u);
  }, [user]);

  useEffect(() => { if (user && (isAgent || isAdmin)) refresh(); }, [user, isAgent, isAdmin, refresh]);

  const showMsg = (text: string, type: "ok" | "err" = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const digits = createPhone.replace(/\D/g, "");
    if (digits.length !== 7) { showMsg("Phone must be 7 digits.", "err"); return; }
    setCreating(true);
    try {
      await agentCreateCustomer(user.id, {
        email: createEmail.toLowerCase().trim(),
        fullName: createName.trim(),
        phone: createPhone,
        plan: createPlan,
      });
      setCreateDone(true);
      setCreateEmail(""); setCreateName(""); setCreatePhone(""); setCreatePlan("basic");
      await refresh();
      showMsg("Customer created! Check Approvals tab to confirm cash collection.");
    } catch (err: any) {
      showMsg(err?.message ?? "Failed to create customer.", "err");
    } finally {
      setCreating(false);
    }
  };

  const handleApproveRequest = async (req: AgentBillingRequest) => {
    setBusy(true);
    try {
      await agentApproveBillingRequest(req.id);
      await refresh();
      showMsg("Cash collection confirmed! Admin will now activate the account.");
    } catch (err: any) {
      showMsg(err?.message ?? "Failed to approve.", "err");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestRenewal = async (customer: AgentCustomer) => {
    if (!user) return;
    setBusy(true);
    try {
      await agentRequestRenewal(user.id, customer.id, customer.plan as PlanId);
      await refresh();
      showMsg(`Renewal request created for ${customer.full_name ?? customer.email}. Check Approvals tab.`);
    } catch (err: any) {
      showMsg(err?.message ?? "Failed to create renewal.", "err");
    } finally {
      setBusy(false);
    }
  };

  const openCustomer = async (c: AgentCustomer) => {
    setSelectedCustomer(c);
    setHistoryLoading(true);
    const history = await fetchCustomerPaymentHistory(c.id);
    setCustomerHistory(history);
    setHistoryLoading(false);
  };

  const pendingApprovals = billingRequests.filter((r) => r.status === "pending_agent");

  if (loading || !user || !profile) return (
    <AppShell><div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">Loading…</div></AppShell>
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl space-y-6 px-4 pb-16 pt-24 sm:px-8">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-extrabold">Agent Dashboard</h1>
        </div>

        {msg && (
          <div className={`rounded-md px-4 py-2.5 text-sm font-medium ${msg.type === "ok" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
            {msg.text}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <SummaryCard label="My Customers" value={customers.length.toString()} icon={<Users className="h-5 w-5 text-primary" />} />
          <SummaryCard label="Commission Earned" value={`TT$${summary.totalCommission}`} icon={<CheckCircle className="h-5 w-5 text-green-500" />} />
          <SummaryCard label="Pending Collection" value={`TT$${summary.pendingCollection}`} icon={<Clock className="h-5 w-5 text-yellow-500" />} />
          <SummaryCard label="Owed to Admin" value={`TT$${summary.pendingAdminCut}`} sub="from pending" icon={<AlertCircle className="h-5 w-5 text-orange-400" />} />
          <SummaryCard label="My Cut (pending)" value={`TT$${summary.pendingAgentCut}`} sub="awaiting admin" icon={<TrendingUp className="h-5 w-5 text-primary" />} />
          <SummaryCard label="Due to Collect" value={upcomingRenewals.length > 0 ? `${upcomingRenewals.length} renewals` : "None"} sub="next 5 days" icon={<Clock className="h-5 w-5 text-yellow-400" />} />
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-border">
          {([
            { id: "create", label: "Create Customer", icon: <UserPlus className="h-4 w-4" /> },
            { id: "customers", label: `Customers (${customers.length})`, icon: <Users className="h-4 w-4" /> },
            { id: "approvals", label: "Approvals", icon: <CheckCircle className="h-4 w-4" />, badge: pendingApprovals.length },
            { id: "renewals", label: "Renewals Due", icon: <Clock className="h-4 w-4" />, badge: upcomingRenewals.length },
          ] as Array<{ id: AgentTab; label: string; icon: React.ReactNode; badge?: number }>).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.icon} {t.label}
              {!!t.badge && t.badge > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── CREATE TAB ── */}
        {tab === "create" && (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold">Sign Up a New Customer</h2>
            <p className="mb-5 text-sm text-muted-foreground">
              Customer's temporary password is <span className="font-mono font-bold text-foreground">Ttflix123!</span> — they can change it after admin approves their account.
            </p>
            {createDone && (
              <div className="mb-4 flex items-start gap-2 rounded-md bg-primary/10 border border-primary/30 px-4 py-3 text-sm">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>Customer created successfully. Go to the <button onClick={() => setTab("approvals")} className="font-semibold underline">Approvals</button> tab to confirm you've collected their cash.</span>
              </div>
            )}
            <form onSubmit={handleCreateCustomer} className="space-y-4">
              <FormField label="Customer Full Name">
                <input required value={createName} onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
              </FormField>
              <FormField label="Email Address">
                <input type="email" required value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
                  className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
              </FormField>
              <FormField label="Phone Number (7 digits)">
                <input type="tel" required value={createPhone}
                  onChange={(e) => setCreatePhone(formatPhone(e.target.value))}
                  placeholder="000-0000" maxLength={8} inputMode="numeric"
                  className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
              </FormField>
              <FormField label="Plan">
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(PLANS).map((p) => {
                    const c = AGENT_COMMISSION[p.id as PlanId];
                    return (
                      <button type="button" key={p.id} onClick={() => setCreatePlan(p.id as PlanId)}
                        className={`rounded-lg border p-3 text-left transition ${createPlan === p.id ? "border-primary bg-primary/10" : "border-border"}`}>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm">{p.name}</span>
                          {createPlan === p.id && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-sm text-primary font-bold">TT${p.price}/{p.annual ? "yr" : "mo"}</p>
                        <p className="text-xs text-green-400 mt-1">Your cut: TT${c.agent}</p>
                        <p className="text-xs text-muted-foreground">Admin: TT${c.admin}</p>
                      </button>
                    );
                  })}
                </div>
              </FormField>
              <button type="submit" disabled={creating}
                className="w-full rounded-md bg-primary py-3 font-bold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60">
                {creating ? "Creating…" : "Create Customer Account"}
              </button>
            </form>
          </section>
        )}

        {/* ── CUSTOMERS TAB ── */}
        {tab === "customers" && (
          <div className="space-y-3">
            {customers.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                No customers yet. Use the Create Customer tab to add your first one.
              </div>
            )}
            {customers.map((c) => {
              const dueDate = c.subscription_expires_at ? new Date(c.subscription_expires_at) : null;
              const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
              const isDueSoon = daysLeft !== null && daysLeft <= 5 && daysLeft >= 0;
              return (
                <button key={c.id} onClick={() => openCustomer(c)}
                  className="w-full rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary hover:bg-primary/5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{c.full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${
                          c.status === "approved" ? "bg-green-500/15 text-green-400"
                          : c.status === "pending" ? "bg-yellow-500/15 text-yellow-400"
                          : "bg-destructive/15 text-destructive"
                        }`}>{c.status}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                          {PLANS[c.plan as PlanId]?.name ?? c.plan}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {dueDate ? (
                        <>
                          <p className="text-xs text-muted-foreground">Next due</p>
                          <p className="text-sm font-semibold">
                            {dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {isDueSoon && (
                            <p className="text-xs font-bold text-yellow-400">
                              {daysLeft === 0 ? "Due today!" : `${daysLeft}d left`}
                            </p>
                          )}
                        </>
                      ) : <p className="text-xs text-muted-foreground">No expiry set</p>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── APPROVALS TAB ── */}
        {tab === "approvals" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Confirm you've collected cash for these accounts. Once you approve, admin will be notified to activate the subscription.
            </p>
            {pendingApprovals.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                No pending approvals. All caught up!
              </div>
            )}
            {pendingApprovals.map((req) => {
              const c = AGENT_COMMISSION[req.plan as PlanId];
              return (
                <div key={req.id} className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{req.customer_full_name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{req.customer_email}</p>
                      <div className="mt-2 space-y-0.5 text-sm">
                        <p><span className="text-muted-foreground">Plan:</span> {PLANS[req.plan as PlanId]?.name ?? req.plan}</p>
                        <p><span className="text-muted-foreground">Total:</span> <span className="font-bold text-foreground">TT${req.amount}</span></p>
                        <p><span className="text-muted-foreground">Your commission:</span> <span className="font-bold text-green-400">TT${req.agent_commission}</span></p>
                        <p><span className="text-muted-foreground">Admin's portion:</span> TT${req.admin_amount}</p>
                        <p><span className="text-muted-foreground">Type:</span> {req.request_type.replace("_", " ")}</p>
                      </div>
                    </div>
                    <button onClick={() => handleApproveRequest(req)} disabled={busy}
                      className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-60">
                      ✓ Cash Collected
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Already sent to admin */}
            {billingRequests.filter((r) => r.status === "pending_admin").length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-muted-foreground">Waiting for Admin Approval</p>
                {billingRequests.filter((r) => r.status === "pending_admin").map((req) => (
                  <div key={req.id} className="rounded-xl border border-border bg-card p-4 mb-2">
                    <p className="font-semibold text-sm">{req.customer_full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{req.customer_email} · {PLANS[req.plan as PlanId]?.name}</p>
                    <p className="mt-1 text-xs text-yellow-400 font-semibold">Awaiting admin activation…</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── RENEWALS TAB ── */}
        {tab === "renewals" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Customers whose subscriptions expire within the next 5 days. Collect their renewal cash and create a renewal request.
            </p>
            {upcomingRenewals.length === 0 && (
              <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                No renewals due in the next 5 days.
              </div>
            )}
            {upcomingRenewals.map((c) => {
              const dueDate = new Date(c.subscription_expires_at!);
              const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
              const comm = AGENT_COMMISSION[c.plan as PlanId];
              const alreadyRequested = billingRequests.some(
                (r) => r.customer_id === c.id && r.status !== "approved" && r.status !== "rejected" && r.request_type === "renewal"
              );
              return (
                <div key={c.id} className="rounded-xl border border-orange-400/30 bg-orange-400/5 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold">{c.full_name ?? "—"}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />{c.phone ?? "—"}
                        <Mail className="h-3.5 w-3.5 ml-2" />{c.email}
                      </div>
                      <div className="mt-2 space-y-0.5 text-sm">
                        <p><span className="text-muted-foreground">Plan:</span> {PLANS[c.plan as PlanId]?.name ?? c.plan} · TT${PLANS[c.plan as PlanId]?.price}</p>
                        <p><span className="text-muted-foreground">Due:</span> {dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                          <span className={`ml-2 font-bold ${daysLeft <= 1 ? "text-destructive" : "text-yellow-400"}`}>
                            ({daysLeft === 0 ? "Today!" : `${daysLeft}d`})
                          </span>
                        </p>
                        <p><span className="text-muted-foreground">Collect:</span> <span className="font-bold">TT${comm.total}</span></p>
                        <p><span className="text-muted-foreground">Your cut:</span> <span className="text-green-400 font-bold">TT${comm.agent}</span> · <span className="text-muted-foreground">Admin: TT${comm.admin}</span></p>
                      </div>
                    </div>
                    {alreadyRequested ? (
                      <span className="shrink-0 rounded-full bg-yellow-500/15 px-3 py-1.5 text-xs font-bold text-yellow-400">Requested</span>
                    ) : (
                      <button onClick={() => handleRequestRenewal(c)} disabled={busy}
                        className="shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-60">
                        Collect &amp; Request
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Customer Detail Modal ── */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold">{selectedCustomer.full_name ?? selectedCustomer.email}</h2>
              <button onClick={() => { setSelectedCustomer(null); setCustomerHistory([]); }}
                className="rounded-md p-1.5 hover:bg-accent">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium break-all">{selectedCustomer.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedCustomer.phone ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Plan</p>
                  <p className="font-medium">{PLANS[selectedCustomer.plan as PlanId]?.name ?? selectedCustomer.plan}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className={`font-semibold capitalize ${selectedCustomer.status === "approved" ? "text-green-400" : selectedCustomer.status === "pending" ? "text-yellow-400" : "text-destructive"}`}>
                    {selectedCustomer.status}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Next Due Date</p>
                  <p className="font-semibold text-primary">
                    {selectedCustomer.subscription_expires_at
                      ? new Date(selectedCustomer.subscription_expires_at).toLocaleDateString("en-TT", { day: "numeric", month: "long", year: "numeric" })
                      : "Not set"}
                  </p>
                </div>
              </div>

              {/* Payment history */}
              <div>
                <h3 className="mb-2 font-semibold text-sm">Payment History</h3>
                {historyLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                {!historyLoading && customerHistory.length === 0 && (
                  <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
                )}
                {!historyLoading && customerHistory.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 mb-1.5 text-sm">
                    <div>
                      <p className="font-medium capitalize">{p.plan.replace("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(p.period_start).toLocaleDateString("en-TT", { day: "numeric", month: "short" })}
                        {" – "}
                        {new Date(p.period_end).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <p className="font-bold text-primary">TT${p.amount}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

function SummaryCard({ label, value, icon, sub }: { label: string; value: string; icon: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className="text-xl font-extrabold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
