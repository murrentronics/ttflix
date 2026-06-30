import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, TrendingUp, Clock, CheckCircle, AlertCircle,
  Check, Phone, Mail, Menu, ChevronDown,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/supabase";
import {
  fetchAgentCustomers, agentCreateCustomer, agentApproveBillingRequest,
  fetchAgentBillingRequests, fetchAgentSummary, fetchAgentUpcomingRenewals,
  agentRequestRenewal, agentPayAndSubmitRenewal, fetchCustomerPaymentHistory,
  AGENT_COMMISSION, type AgentCustomer, type AgentBillingRequest,
} from "@/lib/agent";

type AgentTab = "create" | "pending" | "active" | "suspended" | "expelled" | "approvals" | "renewals";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

const NAV_ITEMS: Array<{ id: AgentTab; label: string; icon: React.ReactNode }> = [
  { id: "create",    label: "Create Customer", icon: <UserPlus    className="h-4 w-4 shrink-0" /> },
  { id: "pending",   label: "Pending",         icon: <Clock       className="h-4 w-4 shrink-0" /> },
  { id: "active",    label: "Active",           icon: <Users       className="h-4 w-4 shrink-0" /> },
  { id: "suspended", label: "Suspended",        icon: <AlertCircle className="h-4 w-4 shrink-0" /> },
  { id: "expelled",  label: "Expelled",         icon: <AlertCircle className="h-4 w-4 shrink-0" /> },
  { id: "approvals", label: "Approvals",        icon: <CheckCircle className="h-4 w-4 shrink-0" /> },
  { id: "renewals",  label: "Renewals Due",     icon: <Clock       className="h-4 w-4 shrink-0" /> },
];

export function AgentPage() {
  const { user, profile, loading, isAgent, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AgentTab>("create");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState<AgentCustomer[]>([]);
  const [billingRequests, setBillingRequests] = useState<AgentBillingRequest[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<AgentCustomer[]>([]);
  const [summary, setSummary] = useState({
    totalCommission: 0, totalAdminAmount: 0,
    pendingCollection: 0, pendingAgentCut: 0, pendingAdminCut: 0,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);

  // Create form state
  const [createEmail, setCreateEmail] = useState("");
  const [createName, setCreateName] = useState("");
  const [createPhone, setCreatePhone] = useState("");
  const [createPlan, setCreatePlan] = useState<PlanId>("basic");
  const [agentPassword, setAgentPassword] = useState("");
  const [creating, setCreating] = useState(false);

  // Customer accordion
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [customerHistory, setCustomerHistory] = useState<Record<string, any[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Record<string, boolean>>({});

  // Inline pay form on approved customer card
  const [payOpen, setPayOpen] = useState<string | null>(null);       // customer id
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState("");

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

  const switchTab = (id: AgentTab) => { setTab(id); setSidebarOpen(false); };

  const pendingApprovals = billingRequests.filter((r) => r.status === "pending_agent");

  const custPending   = customers.filter((c) => c.status === "pending");
  const custActive    = customers.filter((c) => c.status === "approved");
  const custSuspended = customers.filter((c) => c.status === "suspended");
  const custExpelled  = customers.filter((c) => c.status === "expelled");

  const badges: Partial<Record<AgentTab, number>> = {
    pending:   custPending.length,
    active:    custActive.length,
    suspended: custSuspended.length,
    expelled:  custExpelled.length,
    approvals: pendingApprovals.length,
    renewals:  upcomingRenewals.length,
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const digits = createPhone.replace(/\D/g, "");
    if (digits.length !== 7) { showMsg("Phone must be 7 digits.", "err"); return; }
    if (!agentPassword) { showMsg("Enter your password to keep your session.", "err"); return; }
    setCreating(true);
    try {
      await agentCreateCustomer(user.id, profile!.email, agentPassword, {
        email: createEmail.toLowerCase().trim(),
        fullName: createName.trim(),
        phone: createPhone,
        plan: createPlan,
      });
      setCreateEmail(""); setCreateName(""); setCreatePhone("");
      setCreatePlan("basic"); setAgentPassword("");
      await refresh();
      showMsg("Customer created and sent to admin for activation.");
      // Auto-navigate to pending tab so agent sees the new record
      switchTab("pending");
    } catch (err: any) {
      showMsg(err?.message ?? "Failed to create customer.", "err");
    } finally { setCreating(false); }
  };

  const handleApproveRequest = async (req: AgentBillingRequest) => {
    setBusy(true);
    try {
      await agentApproveBillingRequest(req.id);
      await refresh();
      showMsg("Cash confirmed! Admin will now activate the account.");
    } catch (err: any) { showMsg(err?.message ?? "Failed.", "err"); }
    finally { setBusy(false); }
  };

  const handleRequestRenewal = async (customer: AgentCustomer) => {
    if (!user) return;
    setBusy(true);
    try {
      await agentRequestRenewal(user.id, customer.id, customer.plan as PlanId);
      await refresh();
      showMsg(`Renewal created for ${customer.full_name ?? customer.email}. Check Approvals.`);
    } catch (err: any) { showMsg(err?.message ?? "Failed.", "err"); }
    finally { setBusy(false); }
  };

  const handlePayAndSubmit = async (customer: AgentCustomer) => {
    if (!user) return;
    const planDef = PLANS[customer.plan as PlanId];
    const comm = AGENT_COMMISSION[customer.plan as PlanId];
    const required = comm?.total ?? planDef?.price ?? 0;
    const entered = parseInt(payAmount, 10);
    if (isNaN(entered) || entered !== required) {
      setPayError(`You need to enter the plan amount total: TT$${required}`);
      return;
    }
    setPayError("");
    setBusy(true);
    try {
      await agentPayAndSubmitRenewal(user.id, customer.id, customer.plan as PlanId);
      await refresh();
      setPayOpen(null);
      setPayAmount("");
      showMsg("Payment submitted! Admin will activate the account.");
    } catch (err: any) { showMsg(err?.message ?? "Failed.", "err"); }
    finally { setBusy(false); }
  };

  const toggleCustomer = async (c: AgentCustomer) => {
    if (expandedCustomer === c.id) {
      setExpandedCustomer(null);
      return;
    }
    setExpandedCustomer(c.id);
    // Load history once if not already loaded
    if (!customerHistory[c.id]) {
      setHistoryLoading((h) => ({ ...h, [c.id]: true }));
      const hist = await fetchCustomerPaymentHistory(c.id);
      setCustomerHistory((h) => ({ ...h, [c.id]: hist }));
      setHistoryLoading((h) => ({ ...h, [c.id]: false }));
    }
  };

  if (loading || !user || !profile) return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">Loadingâ€¦</div>
    </AppShell>
  );

  return (
    <AppShell>
      {/* Outer wrapper â€” starts below the fixed app navbar (h â‰ˆ 56px = top-14) */}
      <div className="min-h-screen flex flex-col pt-14">

        {/* â”€â”€ Agent dashboard header â€” sticky below app navbar â”€â”€ */}
        <div className="sticky top-14 z-30 flex items-center gap-3 bg-[#c0001a] px-4 py-3 md:hidden shadow-md">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded p-1 text-white focus-visible:outline-none"
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <TrendingUp className="h-5 w-5 text-white" />
          <span className="text-lg font-extrabold text-white">Agent Dashboard</span>
          <span className="ml-auto text-sm font-semibold text-white/80">
            {NAV_ITEMS.find((n) => n.id === tab)?.label}
          </span>
        </div>

        {/* â”€â”€ Mobile sidebar overlay â”€â”€ */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex flex-1">
          {/* â”€â”€ Sidebar â”€â”€ */}
          <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-[#c0001a] flex flex-col pt-14
            transform transition-transform duration-200
            md:sticky md:top-14 md:self-start md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:pt-0 md:w-56 md:shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}>
            {/* Sidebar header â€” desktop only */}
            <div className="hidden md:flex items-center gap-2 px-5 py-5 border-b border-black/30 bg-[#c0001a] sticky top-14 z-10">
              <TrendingUp className="h-5 w-5 text-white" />
              <span className="font-extrabold text-white text-base">Agent Dashboard</span>
            </div>

            {/* Nav items */}
            <nav className="flex flex-col mt-2">
              {NAV_ITEMS.map((item) => {
                const badge = badges[item.id] ?? 0;
                const active = tab === item.id;
                const badgeColor =
                  item.id === "pending"   ? "bg-yellow-500 text-black" :
                  item.id === "active"    ? "bg-green-500 text-black" :
                  item.id === "suspended" ? "bg-orange-500 text-white" :
                  item.id === "expelled"  ? "bg-destructive text-white" :
                  item.id === "approvals" ? "bg-white text-[#c0001a]" :
                  item.id === "renewals"  ? "bg-yellow-500 text-black" :
                  "bg-white text-[#c0001a]";
                return (
                  <button
                    key={item.id}
                    onClick={() => switchTab(item.id)}
                    className={`
                      flex items-center gap-3 px-5 py-3.5 text-sm font-semibold text-white text-left
                      border-b border-black/40 transition-colors
                      ${active ? "bg-black/25" : "hover:bg-black/15"}
                    `}
                  >
                    {item.icon}
                    <span className="flex-1">{item.label}</span>
                    {badge > 0 && (
                      <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-bold ${badgeColor}`}>
                        {badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Summary in sidebar */}
            <div className="mt-auto px-4 py-4 space-y-2 border-t border-black/30">
              <p className="text-xs font-bold text-white/60 uppercase tracking-wide">Summary</p>
              <SidebarStat label="Commission earned" value={`TT$${summary.totalCommission}`} />
              <SidebarStat label="Pending collection" value={`TT$${summary.pendingCollection}`} />
              <SidebarStat label="Owed to admin" value={`TT$${summary.pendingAdminCut}`} />
            </div>
          </aside>

          {/* â”€â”€ Main content â”€â”€ */}
          <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 overflow-y-auto">

            {msg && (
              <div className={`mb-4 rounded-md px-4 py-2.5 text-sm font-medium ${msg.type === "ok" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                {msg.text}
              </div>
            )}

            {/* Summary cards â€” mobile only */}
            <div className="grid grid-cols-2 gap-3 mb-6 md:hidden">
              <SummaryCard label="Commission" value={`TT$${summary.totalCommission}`} icon={<CheckCircle className="h-4 w-4 text-green-500" />} />
              <SummaryCard label="Pending" value={`TT$${summary.pendingCollection}`} icon={<Clock className="h-4 w-4 text-yellow-500" />} />
              <SummaryCard label="Owed to Admin" value={`TT$${summary.pendingAdminCut}`} icon={<AlertCircle className="h-4 w-4 text-orange-400" />} />
              <SummaryCard label="Active" value={`${custActive.length}`} icon={<Users className="h-4 w-4 text-primary" />} />
            </div>

            {/* â”€â”€ CREATE TAB â”€â”€ */}
            {tab === "create" && (
              <section className="max-w-lg rounded-xl border border-border bg-card p-5 sm:p-6">
                <h2 className="mb-1 text-lg font-bold">Sign Up a New Customer</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Temporary password: <span className="font-mono font-bold text-foreground">123456</span> â€” customer changes it after admin approval.
                </p>
                {/* 6-hour activation note â€” always visible */}
                <div className="mb-4 rounded-md bg-yellow-500/10 border border-yellow-500/25 px-3 py-2.5 text-xs text-yellow-400 leading-relaxed">
                  <span className="font-bold">Tell your customer:</span> After registration, account activation may take up to 6 hours. Please be patient while the admin processes the request.
                </div>
                <form onSubmit={handleCreateCustomer} className="space-y-4">
                  <FormField label="Customer Full Name">
                    <input required value={createName} onChange={(e) => setCreateName(e.target.value)}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
                  </FormField>
                  <FormField label="Email Address">
                    <input type="email" required value={createEmail} onChange={(e) => setCreateEmail(e.target.value)}
                      className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
                  </FormField>
                  <FormField label="Phone (7 digits)">
                    <input type="tel" required value={createPhone}
                      onChange={(e) => setCreatePhone(formatPhone(e.target.value))}
                      placeholder="000-0000" maxLength={8} inputMode="numeric"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
                  </FormField>
                  <FormField label="Plan">
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(PLANS).map((p) => {
                        const comm = AGENT_COMMISSION[p.id as PlanId];
                        return (
                          <button type="button" key={p.id} onClick={() => setCreatePlan(p.id as PlanId)}
                            className={`rounded-lg border p-3 text-left transition ${createPlan === p.id ? "border-primary bg-primary/10" : "border-border"}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-sm">{p.name}</span>
                              {createPlan === p.id && <Check className="h-4 w-4 text-primary" />}
                            </div>
                            <p className="text-sm text-primary font-bold">TT${p.price}/{p.annual ? "yr" : "mo"}</p>
                            <p className="text-xs text-green-400 mt-1">You: TT${comm.agent}</p>
                            <p className="text-xs text-muted-foreground">Admin: TT${comm.admin}</p>
                          </button>
                        );
                      })}
                    </div>
                  </FormField>
                  <FormField label="Your Password (keeps you signed in)">
                    <input type="password" required value={agentPassword} onChange={(e) => setAgentPassword(e.target.value)}
                      placeholder="Your login password"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
                  </FormField>
                  <button type="submit" disabled={creating}
                    className="w-full rounded-md bg-[#c0001a] py-3 font-bold text-white transition hover:bg-[#a30016] disabled:opacity-60">
                    {creating ? "Creatingâ€¦" : "Create Customer Account"}
                  </button>
                </form>
              </section>
            )}

            {/* â”€â”€ CUSTOMER LIST TABS (pending / active / suspended / expelled) â”€â”€ */}
            {(tab === "pending" || tab === "active" || tab === "suspended" || tab === "expelled") && (() => {
              const listMap: Record<string, AgentCustomer[]> = {
                pending:   custPending,
                active:    custActive,
                suspended: custSuspended,
                expelled:  custExpelled,
              };
              const list = listMap[tab] ?? [];
              const emptyLabel = tab === "active" ? "active" : tab;

              return (
                <div className="space-y-3 max-w-2xl">
                  <h2 className="text-lg font-bold">{NAV_ITEMS.find(n => n.id === tab)?.label}</h2>
                  {list.length === 0 && (
                    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                      No {emptyLabel} customers yet.
                    </div>
                  )}
                  {list.map((c) => {
                    const dueDate = c.subscription_expires_at ? new Date(c.subscription_expires_at) : null;
                    const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                    const isDueSoon = daysLeft !== null && daysLeft <= 5 && daysLeft >= 0;
                    const comm = AGENT_COMMISSION[c.plan as PlanId];
                    const planPrice = comm?.total ?? PLANS[c.plan as PlanId]?.price ?? 0;
                    const isPayOpen = payOpen === c.id;
                    const enteredAmt = parseInt(payAmount, 10);
                    const amountExact = !isNaN(enteredAmt) && enteredAmt === planPrice;
                    const alreadyPending = billingRequests.some(
                      (r) => r.customer_id === c.id &&
                        (r.status === "pending_agent" || r.status === "pending_admin")
                    );
                    const isExpanded = expandedCustomer === c.id;
                    const hist = customerHistory[c.id] ?? [];
                    const histLoading = historyLoading[c.id] ?? false;

                    return (
                      <div key={c.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="p-4">
                          <div className="flex items-start gap-4">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{c.full_name ?? "â€”"}</p>
                              <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <span className={`rounded-full px-2 py-0.5 font-semibold ${
                                  c.status === "approved"  ? "bg-green-500/15 text-green-400"
                                  : c.status === "pending"   ? "bg-yellow-500/15 text-yellow-400"
                                  : c.status === "suspended" ? "bg-orange-500/15 text-orange-400"
                                  : "bg-destructive/15 text-destructive"
                                }`}>{c.status === "approved" ? "active" : c.status}</span>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                                  {PLANS[c.plan as PlanId]?.name ?? c.plan}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0 text-right flex flex-col items-end gap-2">
                              {tab === "active" && dueDate && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Next due</p>
                                  <p className="text-sm font-semibold">
                                    {dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                                  </p>
                                  {isDueSoon && (
                                    <p className="text-xs font-bold text-yellow-400">
                                      {daysLeft === 0 ? "Due today!" : `${daysLeft}d left`}
                                    </p>
                                  )}
                                </div>
                              )}
                              {tab === "pending"   && <p className="text-xs text-yellow-400 font-semibold">Awaiting approval</p>}
                              {tab === "suspended" && <p className="text-xs text-orange-400 font-semibold">Suspended</p>}
                              {tab === "expelled"  && <p className="text-xs text-destructive font-semibold">Expelled</p>}

                              {tab === "active" && (
                                alreadyPending ? (
                                  <span className="rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-bold text-yellow-400">Pending admin</span>
                                ) : (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); if (isPayOpen) { setPayOpen(null); setPayAmount(""); setPayError(""); } else { setPayOpen(c.id); setPayAmount(""); setPayError(""); } }}
                                    className={`rounded-md px-4 py-1.5 text-sm font-bold transition ${isPayOpen ? "border border-border text-muted-foreground hover:bg-accent" : "bg-[#c0001a] text-white hover:bg-[#a30016]"}`}
                                  >
                                    {isPayOpen ? "Cancel" : "Pay"}
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {isPayOpen && tab === "active" && (
                            <div className="mt-4 rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                              <div>
                                <p className="text-xs font-semibold text-muted-foreground mb-0.5">
                                  Plan: <span className="text-foreground">{PLANS[c.plan as PlanId]?.name}</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Enter exact amount: <span className="font-bold text-foreground">TT${planPrice}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold shrink-0">TT$</span>
                                <input type="number" inputMode="numeric" min={1}
                                  value={payAmount} onChange={(e) => { setPayAmount(e.target.value); setPayError(""); }}
                                  placeholder={`${planPrice}`}
                                  className="w-32 rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                                />
                                <button onClick={() => handlePayAndSubmit(c)} disabled={busy || !amountExact}
                                  className="rounded-md bg-[#c0001a] px-5 py-2 text-sm font-bold text-white hover:bg-[#a30016] disabled:opacity-50 disabled:cursor-not-allowed transition">
                                  {busy ? "Sendingâ€¦" : "Send"}
                                </button>
                              </div>
                              {payError && <p className="text-xs font-semibold text-destructive">{payError}</p>}
                              <div className="rounded-md bg-yellow-500/10 border border-yellow-500/25 px-3 py-2.5 text-xs text-yellow-400 leading-relaxed">
                                <span className="font-bold">Note to tell your customer:</span> After payment is submitted, account activation may take up to 6 hours.
                              </div>
                            </div>
                          )}

                          <button onClick={() => toggleCustomer(c)} aria-label={isExpanded ? "Collapse" : "Expand"}
                            className="mt-3 flex w-full items-center justify-center text-muted-foreground hover:text-foreground transition">
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                              <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium break-all">{c.email}</p></div>
                              <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{c.phone ?? "â€”"}</p></div>
                              <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{PLANS[c.plan as PlanId]?.name ?? c.plan}</p></div>
                              <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-medium text-primary">TT${PLANS[c.plan as PlanId]?.price ?? "â€”"}</p></div>
                              <div>
                                <p className="text-xs text-muted-foreground">Status</p>
                                <p className={`font-semibold capitalize ${
                                  c.status === "approved"  ? "text-green-400"
                                  : c.status === "pending"   ? "text-yellow-400"
                                  : c.status === "suspended" ? "text-orange-400"
                                  : "text-destructive"
                                }`}>{c.status === "approved" ? "active" : c.status}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Next Due</p>
                                <p className="font-semibold text-primary">
                                  {dueDate ? dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "long", year: "numeric" }) : "Not set"}
                                </p>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 border-t border-border pt-3">Payment History</p>
                              {histLoading && <p className="text-sm text-muted-foreground">Loadingâ€¦</p>}
                              {!histLoading && hist.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
                              {!histLoading && hist.map((p) => (
                                <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 mb-1.5 text-sm">
                                  <div>
                                    <p className="font-medium capitalize">{p.plan.replace(/_/g, " ")}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(p.period_start).toLocaleDateString("en-TT", { day: "numeric", month: "short" })}
                                      {" â€“ "}
                                      {new Date(p.period_end).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                                    </p>
                                  </div>
                                  <p className="font-bold text-primary">TT${p.amount}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
            }

            {/* â”€â”€ APPROVALS TAB â”€â”€ */}
            {tab === "approvals" && (
              <div className="space-y-4 max-w-2xl">
                <h2 className="text-lg font-bold">Approvals</h2>
                <p className="text-sm text-muted-foreground">
                  Confirm cash collected â€” admin will then activate the account.
                </p>
                {pendingApprovals.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                    No pending approvals. All caught up!
                  </div>
                )}
                {pendingApprovals.map((req) => (
                  <div key={req.id} className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-1 text-sm">
                        <p className="font-semibold text-base">{req.customer_full_name ?? "â€”"}</p>
                        <p className="text-muted-foreground">{req.customer_email}</p>
                        <p><span className="text-muted-foreground">Plan:</span> {PLANS[req.plan as PlanId]?.name ?? req.plan}</p>
                        <p><span className="text-muted-foreground">Total:</span> <span className="font-bold">TT${req.amount}</span></p>
                        <p><span className="text-muted-foreground">Your cut:</span> <span className="font-bold text-green-400">TT${req.agent_commission}</span></p>
                        <p><span className="text-muted-foreground">Admin's portion:</span> TT${req.admin_amount}</p>
                        <p><span className="text-muted-foreground">Type:</span> <span className="capitalize">{req.request_type.replace(/_/g, " ")}</span></p>
                      </div>
                      <button onClick={() => handleApproveRequest(req)} disabled={busy}
                        className="shrink-0 rounded-md bg-[#c0001a] px-4 py-2 text-sm font-bold text-white hover:bg-[#a30016] disabled:opacity-60">
                        âœ“ Cash Collected
                      </button>
                    </div>
                  </div>
                ))}
                {billingRequests.filter((r) => r.status === "pending_admin").length > 0 && (
                  <div>
                    <p className="mb-2 text-sm font-semibold text-muted-foreground">Waiting for Admin</p>
                    {billingRequests.filter((r) => r.status === "pending_admin").map((req) => (
                      <div key={req.id} className="rounded-xl border border-border bg-card p-4 mb-2">
                        <p className="font-semibold text-sm">{req.customer_full_name ?? "â€”"}</p>
                        <p className="text-xs text-muted-foreground">{req.customer_email} Â· {PLANS[req.plan as PlanId]?.name}</p>
                        <p className="mt-1 text-xs text-yellow-400 font-semibold">Awaiting admin activationâ€¦</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* â”€â”€ RENEWALS TAB â”€â”€ */}
            {tab === "renewals" && (
              <div className="space-y-4 max-w-2xl">
                <h2 className="text-lg font-bold">Renewals Due</h2>
                <p className="text-sm text-muted-foreground">
                  Customers expiring in the next 5 days. Collect cash and tap Collect &amp; Request.
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
                        <div className="flex-1 min-w-0 space-y-1 text-sm">
                          <p className="font-semibold text-base">{c.full_name ?? "â€”"}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone ?? "â€”"}</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                          </div>
                          <p><span className="text-muted-foreground">Plan:</span> {PLANS[c.plan as PlanId]?.name} Â· TT${PLANS[c.plan as PlanId]?.price}</p>
                          <p>
                            <span className="text-muted-foreground">Due:</span>{" "}
                            {dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                            <span className={`ml-2 font-bold ${daysLeft <= 1 ? "text-destructive" : "text-yellow-400"}`}>
                              {daysLeft === 0 ? "(Today!)" : `(${daysLeft}d)`}
                            </span>
                          </p>
                          <p><span className="text-muted-foreground">Collect:</span> <span className="font-bold">TT${comm.total}</span></p>
                          <p>
                            <span className="text-green-400 font-bold">You: TT${comm.agent}</span>
                            <span className="text-muted-foreground ml-2">Admin: TT${comm.admin}</span>
                          </p>
                        </div>
                        {alreadyRequested ? (
                          <span className="shrink-0 rounded-full bg-yellow-500/15 px-3 py-1.5 text-xs font-bold text-yellow-400">Requested</span>
                        ) : (
                          <button onClick={() => handleRequestRenewal(c)} disabled={busy}
                            className="shrink-0 rounded-md bg-[#c0001a] px-4 py-2 text-sm font-bold text-white hover:bg-[#a30016] disabled:opacity-60">
                            Collect &amp; Request
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </main>
        </div>
      </div>

    </AppShell>
  );
}

// -- Helper components --

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/70">{label}</span>
      <span className="text-sm font-bold text-white">{value}</span>
    </div>
  );
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <p className="text-lg font-extrabold">{value}</p>
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

