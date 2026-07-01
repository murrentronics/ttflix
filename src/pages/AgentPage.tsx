import { useCallback, useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Users, UserPlus, TrendingUp, Clock, CheckCircle, AlertCircle,
  Check, Phone, Mail, Menu, ChevronDown, LayoutDashboard,
  Search, X, BookOpen,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { PLANS, type PlanId, supabase } from "@/lib/supabase";
import {
  fetchAgentCustomers, agentCreateCustomer,
  fetchAgentBillingRequests, fetchAgentSummary, fetchAgentUpcomingRenewals,
  agentRequestRenewal, agentPayAndSubmitRenewal, fetchCustomerPaymentHistory,
  AGENT_COMMISSION, calcProRata, calcProRataCommission,
  type AgentCustomer, type AgentBillingRequest,
} from "@/lib/agent";

type AgentTab = "dashboard" | "create" | "pending" | "active" | "suspended" | "expelled" | "renewals" | "instructions";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

const NAV_ITEMS: Array<{ id: AgentTab; label: string; icon: React.ReactNode }> = [
  { id: "dashboard",    label: "Dashboard",       icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
  { id: "create",       label: "Create Customer", icon: <UserPlus        className="h-4 w-4 shrink-0" /> },
  { id: "pending",      label: "Pending",         icon: <Clock           className="h-4 w-4 shrink-0" /> },
  { id: "active",       label: "Active",          icon: <Users           className="h-4 w-4 shrink-0" /> },
  { id: "suspended",    label: "Suspended",       icon: <AlertCircle     className="h-4 w-4 shrink-0" /> },
  { id: "expelled",     label: "Expelled",        icon: <AlertCircle     className="h-4 w-4 shrink-0" /> },
  { id: "renewals",     label: "Renewals Due",    icon: <Clock           className="h-4 w-4 shrink-0" /> },
  { id: "instructions", label: "Instructions",    icon: <BookOpen        className="h-4 w-4 shrink-0" /> },
];

export function AgentPage() {
  const { user, profile, loading, isAgent, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AgentTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [customers, setCustomers] = useState<AgentCustomer[]>([]);
  const [search, setSearch] = useState("");
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
  
  // For realtime refresh
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Realtime refresh every 1 second
  useEffect(() => {
    if (!user || (!isAgent && !isAdmin)) return;
    
    refreshIntervalRef.current = setInterval(() => {
      refresh();
    }, 1000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [user, isAgent, isAdmin, refresh]);

  // Supabase realtime for changes to profiles and agent_billing_requests
  useEffect(() => {
    if (!user || (!isAgent && !isAdmin)) return;
    const channel = supabase.channel('agent-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        refresh();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_billing_requests' }, () => {
        refresh();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, isAgent, isAdmin, refresh]);

  const showMsg = (text: string, type: "ok" | "err" = "ok") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const switchTab = (id: AgentTab) => { setTab(id); setSidebarOpen(false); setSearch(""); };

  const searchLower = search.trim().toLowerCase();

  const sortAndFilter = (list: AgentCustomer[]) => {
    return list
      .filter((c) => {
        if (!searchLower) return true;
        return (
          (c.full_name ?? "").toLowerCase().includes(searchLower) ||
          (c.email ?? "").toLowerCase().includes(searchLower) ||
          (c.phone ?? "").toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => {
        const nameA = (a.full_name ?? a.email ?? "").toLowerCase();
        const nameB = (b.full_name ?? b.email ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      });
  };

  const custPending   = sortAndFilter(customers.filter((c) => c.status === "pending"));
  const custActive    = sortAndFilter(customers.filter((c) => c.status === "approved"));
  const custSuspended = sortAndFilter(customers.filter((c) => c.status === "suspended"));
  const custExpelled  = sortAndFilter(customers.filter((c) => c.status === "expelled"));

  const badges: Partial<Record<AgentTab, number>> = {
    pending:   custPending.length,
    active:    custActive.length,
    suspended: custSuspended.length,
    expelled:  custExpelled.length,
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
      const { proRata } = calcProRata(createPlan);
      await agentCreateCustomer(user.id, profile!.email, agentPassword, {
        email: createEmail.toLowerCase().trim(),
        fullName: createName.trim(),
        phone: createPhone,
        plan: createPlan,
        proRataAmount: proRata,
      });
      setCreateEmail(""); setCreateName(""); setCreatePhone("");
      setCreatePlan("basic"); setAgentPassword("");
      await refresh();
      showMsg("Customer created and sent to admin for activation.");
      switchTab("pending");
    } catch (err: any) {
      showMsg(err?.message ?? "Failed to create customer.", "err");
    } finally { setCreating(false); }
  };

  const handleRequestRenewal = async (customer: AgentCustomer) => {
    if (!user) return;
    setBusy(true);
    try {
      await agentRequestRenewal(user.id, customer.id, customer.plan as PlanId);
      await refresh();
      showMsg(`Renewal created for ${customer.full_name ?? customer.email}! Waiting for admin approval.`);
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
      <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">Loading…</div>
    </AppShell>
  );

  return (
    <AppShell>
      {/* Outer wrapper — starts below the fixed app navbar (h ≈ 56px = top-14) */}
      <div className="min-h-screen flex flex-col pt-14">

        {/* —— Agent dashboard header — sticky below app navbar —— ONLY ON DASHBOARD TAB —— */}
        {tab === "dashboard" && (
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
          </div>
        )}

        {/* —— Agent non-dashboard header —— */}
        {tab !== "dashboard" && (
          <div className="sticky top-14 z-30 flex items-center gap-3 bg-card/95 px-4 py-3 md:hidden shadow-sm">
            <button
              onClick={() => setSidebarOpen((o) => !o)}
              className="rounded p-1 text-foreground focus-visible:outline-none"
              aria-label="Toggle menu"
            >
              <Menu className="h-6 w-6" />
            </button>
            <span className="ml-auto text-sm font-semibold text-foreground">
              {NAV_ITEMS.find((n) => n.id === tab)?.label}
            </span>
          </div>
        )}

        {/* —— Mobile sidebar overlay —— */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex flex-1">
          {/* —— Sidebar —— */}
          <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-[#c0001a] flex flex-col pt-14
            transform transition-transform duration-200
            md:sticky md:top-14 md:self-start md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:pt-0 md:w-56 md:shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}>
            {/* Sidebar header — desktop only */}
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

          {/* —— Main content —— */}
          <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 overflow-y-auto">

            {msg && (
              <div className={`mb-4 rounded-md px-4 py-2.5 text-sm font-medium ${msg.type === "ok" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                {msg.text}
              </div>
            )}

            {/* —— DASHBOARD TAB —— */}
            {tab === "dashboard" && (
              <div className="space-y-6">
                <h2 className="text-xl font-extrabold">Dashboard</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <SummaryCard label="Total Commission" value={`TT$${summary.totalCommission}`} icon={<CheckCircle className="h-4 w-4 text-green-500" />} />
                  <SummaryCard label="Pending Collection" value={`TT$${summary.pendingCollection}`} icon={<Clock className="h-4 w-4 text-yellow-500" />} />
                  <SummaryCard label="Owed to Admin" value={`TT$${summary.pendingAdminCut}`} icon={<AlertCircle className="h-4 w-4 text-orange-400" />} />
                  <SummaryCard label="Active Customers" value={`${custActive.length}`} icon={<Users className="h-4 w-4 text-primary" />} />
                  <SummaryCard label="Renewals Due" value={`${upcomingRenewals.length}`} icon={<Clock className="h-4 w-4 text-orange-400" />} />
                </div>
                
                {/* Quick action buttons */}
                <div className="grid grid-cols-1 gap-3">
                  <button onClick={() => switchTab("create")} className="rounded-xl bg-[#c0001a] p-4 flex items-center justify-center gap-3 text-white font-semibold hover:bg-[#a30016] transition">
                    <UserPlus className="h-5 w-5" />
                    Create Customer
                  </button>
                </div>
              </div>
            )}



            {/* —— CREATE TAB —— */}
            {tab === "create" && (
              <section className="max-w-lg rounded-xl border border-border bg-card p-5 sm:p-6">
                <h2 className="mb-1 text-lg font-bold">Sign Up a New Customer</h2>
                <p className="mb-4 text-sm text-muted-foreground">
                  Temporary password: <span className="font-mono font-bold text-foreground">123456</span> — customer changes it after admin approval.
                </p>
                {/* 6-hour activation note — always visible */}
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
                        const { proRata, isProRata } = calcProRata(p.id as PlanId);
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
                    {/* Pro-rata callout for the selected plan */}
                    {(() => {
                      const { proRata, isProRata, daysRemaining, daysInMonth } = calcProRata(createPlan);
                      const { agent, admin } = calcProRataCommission(createPlan, proRata);
                      const isAnnual = PLANS[createPlan]?.annual;
                      return (
                        <div className={`mt-3 rounded-lg px-4 py-3 text-sm border ${isProRata ? "bg-yellow-500/10 border-yellow-500/30" : "bg-primary/10 border-primary/25"}`}>
                          <p className="font-bold text-foreground mb-1">
                            💰 Collect from customer today: <span className="text-primary">TT${proRata}</span>
                          </p>
                          {isAnnual ? (
                            <p className="text-xs text-muted-foreground">Annual plan — full price, no pro-rata.</p>
                          ) : isProRata ? (
                            <p className="text-xs text-muted-foreground">
                              Pro-rata: {daysRemaining} of {daysInMonth} days remaining this month.
                              You keep <span className="text-green-400 font-semibold">TT${agent}</span>, give admin <span className="font-semibold text-foreground">TT${admin}</span>.
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Signing up on day 1 — full month charge.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </FormField>
                  <FormField label="Your Password (keeps you signed in)">
                    <input type="password" required value={agentPassword} onChange={(e) => setAgentPassword(e.target.value)}
                      placeholder="Your login password"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
                  </FormField>
                  <button type="submit" disabled={creating}
                    className="w-full rounded-md bg-[#c0001a] py-3 font-bold text-white transition hover:bg-[#a30016] disabled:opacity-60">
                    {creating ? "Creating…" : "Create Customer Account"}
                  </button>
                </form>
              </section>
            )}

            {/* —— CUSTOMER LIST TABS (pending / active / suspended / expelled) —— */}
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
                  {/* Search input */}
                  <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, email, phone…"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
                    />
                    {search && (
                      <button onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {list.length === 0 && (
                    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                      No {emptyLabel} customers yet.
                    </div>
                  )}
                  {list.map((c) => {
                    const rawExpiry = c.subscription_expires_at ? new Date(c.subscription_expires_at) : null;
                    const dueDate = rawExpiry ? new Date(Date.UTC(rawExpiry.getUTCFullYear(), rawExpiry.getUTCMonth(), rawExpiry.getUTCDate() - 1)) : null;
                    const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                    const isDueSoon = daysLeft !== null && daysLeft <= 5 && daysLeft >= 0;
                    const comm = AGENT_COMMISSION[c.plan as PlanId];
                    const planPrice = comm?.total ?? PLANS[c.plan as PlanId]?.price ?? 0;
                    const isPayOpen = payOpen === c.id;
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
                              <p className="font-semibold truncate">{c.full_name ?? "—"}</p>
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



                          <button onClick={() => toggleCustomer(c)} aria-label={isExpanded ? "Collapse" : "Expand"}
                            className="mt-3 flex w-full items-center justify-center text-muted-foreground hover:text-foreground transition">
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="border-t border-border px-4 pb-4 pt-3 space-y-4">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                              <div><p className="text-xs text-muted-foreground">Email</p><p className="font-medium break-all">{c.email}</p></div>
                              <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{c.phone ?? "—"}</p></div>
                              <div><p className="text-xs text-muted-foreground">Plan</p><p className="font-medium">{PLANS[c.plan as PlanId]?.name ?? c.plan}</p></div>
                              <div><p className="text-xs text-muted-foreground">Amount</p><p className="font-medium text-primary">TT${PLANS[c.plan as PlanId]?.price ?? "—"}</p></div>
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
                              {histLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
                              {!histLoading && hist.length === 0 && <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
                              {!histLoading && hist.map((p) => (
                                <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 mb-1.5 text-sm">
                                  <div>
                                    <p className="font-medium capitalize">{p.plan.replace(/_/g, " ")}</p>
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
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
            }



            {/* —— RENEWALS TAB —— */}
            {tab === "renewals" && (
              <div className="space-y-4 max-w-2xl">
                <h2 className="text-lg font-bold">Renewals Due</h2>
                <p className="text-sm text-muted-foreground">
                  Customers expiring in the next 5 days. Collect cash and tap Collect & Request.
                </p>
                {/* Search input for renewals */}
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name, email, phone…"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
                    />
                    {search && (
                      <button onClick={() => setSearch("")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                {/* Filter and sort upcoming renewals */}
                {(() => {
                  const filteredRenewals = sortAndFilter(upcomingRenewals);
                  return (
                    <>
                      {filteredRenewals.length === 0 && (
                        <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                          {search ? "No results found" : "No renewals due in the next 5 days."}
                        </div>
                      )}
                      {filteredRenewals.map((c) => {
                  const rawExpiry = new Date(c.subscription_expires_at!);
                  const dueDate = new Date(Date.UTC(rawExpiry.getUTCFullYear(), rawExpiry.getUTCMonth(), rawExpiry.getUTCDate() - 1));
                  const daysLeft = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const comm = AGENT_COMMISSION[c.plan as PlanId];
                  const alreadyRequested = billingRequests.some(
                    (r) => r.customer_id === c.id && r.status !== "approved" && r.status !== "rejected" && r.request_type === "renewal"
                  );
                  return (
                    <div key={c.id} className="rounded-xl border border-orange-400/30 bg-orange-400/5 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0 space-y-1 text-sm">
                          <p className="font-semibold text-base">{c.full_name ?? "—"}</p>
                          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone ?? "—"}</span>
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</span>
                          </div>
                          <p><span className="text-muted-foreground">Plan:</span> {PLANS[c.plan as PlanId]?.name} · TT${PLANS[c.plan as PlanId]?.price}</p>
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
                            Collect & Request
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
              </div>
            )}

            {/* —— INSTRUCTIONS TAB —— */}
            {tab === "instructions" && (
              <div className="max-w-2xl space-y-6">
                <div className="rounded-2xl bg-gradient-to-br from-[#c0001a] via-[#8b0013] to-[#1a0005] p-6 shadow-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <BookOpen className="h-5 w-5 text-white/80" />
                    <span className="text-xs font-bold text-white/70 uppercase tracking-widest">Agent Guide</span>
                  </div>
                  <h1 className="text-2xl font-extrabold text-white">How TTFlix Agents Work</h1>
                  <p className="mt-1 text-sm text-white/70">Everything you need to know to sign up and manage your customers.</p>
                </div>

                {/* Section 1 — Your Role */}
                <InstructionSection title="Your Role as an Agent">
                  <p>As a TTFlix Agent you are responsible for:</p>
                  <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                    <li>Signing up new customers and collecting their first payment</li>
                    <li>Collecting monthly renewal payments from your customers</li>
                    <li>Submitting payments to admin for account activation</li>
                    <li>Keeping your customers informed about their due dates</li>
                  </ul>
                </InstructionSection>

                {/* Section 2 — Payment Structure */}
                <InstructionSection title="Payment Structure">
                  <p className="text-sm text-muted-foreground mb-3">All payments are collected in <span className="font-bold text-foreground">TT dollars, cash only</span>. You keep your commission and hand the admin portion to admin.</p>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.values(PLANS).map((p) => {
                      const comm = AGENT_COMMISSION[p.id as PlanId];
                      return (
                        <div key={p.id} className="rounded-lg border border-border bg-card/60 px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold">{p.name}</span>
                            <span className="font-extrabold text-primary">TT${p.price}/{p.annual ? "yr" : "mo"}</span>
                          </div>
                          <div className="flex gap-4 text-xs">
                            <span className="text-green-400 font-semibold">You keep: TT${comm.agent}</span>
                            <span className="text-muted-foreground">Give admin: TT${comm.admin}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </InstructionSection>

                {/* Section 3 — Pro-Rata (First Month) */}
                <InstructionSection title="First Month Pro-Rata Pricing">
                  <p className="text-sm text-muted-foreground mb-3">
                    Monthly plan customers only pay for the <span className="font-bold text-foreground">remaining days of the month</span> when they sign up — not the full month. Annual plans always charge full price.
                  </p>
                  <div className="rounded-lg bg-primary/10 border border-primary/25 px-4 py-3 text-sm space-y-2">
                    <p className="font-bold text-foreground">How to calculate:</p>
                    <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                      <li>Find out how many days are left in the month (including today)</li>
                      <li>Divide the full plan price by the total days in the month</li>
                      <li>Multiply by the days remaining — round to nearest dollar</li>
                    </ol>
                    <div className="mt-3 rounded-md bg-card border border-border px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-bold text-foreground">Example:</span> Standard plan TT$60, signing up on the 15th of a 30-day month<br />
                      Remaining days = 30 − 15 + 1 = <span className="font-bold text-foreground">16 days</span><br />
                      Daily rate = TT$60 ÷ 30 = <span className="font-bold text-foreground">TT$2.00/day</span><br />
                      First payment = 16 × TT$2.00 = <span className="font-bold text-primary">TT$32</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    The <span className="font-bold text-foreground">Create Customer</span> tab calculates this automatically for you — just check the amount shown before collecting.
                  </p>
                </InstructionSection>

                {/* Section 4 — Due Dates & Renewals */}
                <InstructionSection title="Due Dates &amp; Renewals">
                  <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                    <li>All monthly subscriptions renew on the <span className="font-bold text-foreground">1st of every month</span>.</li>
                    <li>Tell your customers their payment is due on the <span className="font-bold text-foreground">last day of the month</span>.</li>
                    <li>You have the <span className="font-bold text-foreground">entire 1st of the month</span> to collect and submit renewals before any account is suspended.</li>
                    <li>Accounts that are not renewed by midnight on the 1st are automatically suspended.</li>
                    <li>Use the <span className="font-bold text-foreground">Renewals Due</span> tab to see who is coming up for renewal and submit requests.</li>
                  </ul>
                </InstructionSection>

                {/* Section 5 — Step by Step */}
                <InstructionSection title="Step-by-Step: Signing Up a New Customer">
                  <ol className="list-decimal pl-5 space-y-2 text-sm text-muted-foreground">
                    <li>Go to <span className="font-bold text-foreground">Create Customer</span> and fill in their details.</li>
                    <li>Select their plan — the <span className="font-bold text-foreground">first payment amount is shown automatically</span> (pro-rata for monthly plans).</li>
                    <li>Collect the cash from the customer before submitting.</li>
                    <li>Enter your password and tap <span className="font-bold text-foreground">Create Customer Account</span>.</li>
                    <li>The request goes to admin — account activates within <span className="font-bold text-foreground">6 hours</span>.</li>
                    <li>Your customer's temp password is <span className="font-mono font-bold text-foreground">123456</span> — they must change it after first login.</li>
                  </ol>
                </InstructionSection>

                {/* Section 6 — What to Tell Customers */}
                <InstructionSection title="What to Tell Your Customers">
                  <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm space-y-2">
                    <p className="font-bold text-foreground">Script you can use:</p>
                    <p className="text-muted-foreground italic">
                      "Your TTFlix subscription renews on the 1st of every month. Your payment of TT$[amount] is due by the last day of the month. If payment is not received by midnight on the 1st, your account will be suspended until payment is collected. Once I receive your payment and submit it, your account is reactivated within a few hours."
                    </p>
                  </div>
                </InstructionSection>
              </div>
            )}

          </main>
        </div>
      </div>

      {payOpen && (() => {
        const c = customers.find(cust => cust.id === payOpen)!;
        const comm = AGENT_COMMISSION[c.plan as PlanId];
        const planPrice = comm?.total ?? PLANS[c.plan as PlanId]?.price ?? 0;
        const enteredAmt = parseInt(payAmount, 10);
        const amountExact = !isNaN(enteredAmt) && enteredAmt === planPrice;
        return (
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 pb-safe shadow-2xl">
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold">{c.full_name ?? "—"}</p>
                  <p className="text-xs text-muted-foreground">{c.email}</p>
                </div>
                <button onClick={() => { setPayOpen(null); setPayAmount(""); setPayError(""); }}
                  className="text-muted-foreground hover:text-foreground">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Plan</p>
                  <p className="text-sm font-semibold">{PLANS[c.plan as PlanId]?.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold shrink-0">TT$</span>
                  <input autoFocus type="number" inputMode="numeric" min={1}
                    value={payAmount} onChange={(e) => { setPayAmount(e.target.value); setPayError(""); }}
                    placeholder={`${planPrice}`}
                    className="flex-1 rounded-md border border-border bg-input px-3 py-3 text-base outline-none focus:border-primary"
                  />
                  <button onClick={() => handlePayAndSubmit(c)} disabled={busy || !amountExact}
                    className="rounded-md bg-[#c0001a] px-6 py-3 text-base font-bold text-white hover:bg-[#a30016] disabled:opacity-50 disabled:cursor-not-allowed transition">
                    {busy ? "Sending…" : "Send"}
                  </button>
                </div>
                {payError && <p className="text-xs font-semibold text-destructive">{payError}</p>}
                <div className="rounded-md bg-yellow-500/10 border border-yellow-500/25 px-3 py-2.5 text-xs text-yellow-400 leading-relaxed">
                  <span className="font-bold">Note to tell your customer:</span> After payment is submitted, account activation may take up to 6 hours.
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

function InstructionSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  );
}
