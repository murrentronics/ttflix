import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Trash2, Ban, UserX, ShieldCheck, CalendarDays, Receipt,
  ChevronLeft, ChevronRight, Tv, Search, X, Briefcase, ChevronDown, Menu,
  LayoutDashboard, TrendingUp, Users, DollarSign, UserPlus, Phone, Wallet,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase, STATUS_LABELS, PLANS, type UserStatus } from "@/lib/supabase";
import {
  fetchUsersByStatus, countByStatus, setUserStatus, setUserRole, makeUserAgent, removeUserAgent, deleteUserRecord,
  fetchPendingAgentBillingRequests, adminApproveAgentRequest, adminRejectAgentRequest,
  fetchAgentList, fetchAgentCustomerLinks, fetchDashboardStats, fetchPaymentHistory, adminCreateAgent,
  fetchAgentCollections, clearAgentBalance,
  type AdminUser, type PaymentRecord, type AgentBillingRequestAdmin, type AgentListItem, type DashboardStats,
  type AgentCollectionItem,
} from "@/lib/admin";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_TABS: UserStatus[] = ["pending", "approved", "suspended", "expelled"];
type AdminTab = UserStatus | "billing" | "history" | "watching" | "agent-requests" | "agent-list" | "dashboard" | "create-agent" | "collections";
const PAGE_SIZE = 100;

type NavItem = { id: AdminTab; label: string; icon: React.ReactNode };

export function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [upcomingRenewals, setUpcomingRenewals] = useState<AdminUser[]>([]);
  const [renewalCount, setRenewalCount] = useState(0);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [counts, setCounts] = useState<Record<UserStatus, number>>({ pending: 0, approved: 0, suspended: 0, expelled: 0 });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [watchingNow, setWatchingNow] = useState<any[]>([]);
  const [watchingCount, setWatchingCount] = useState(0);
  const [search, setSearch] = useState("");
  const [agentRequests, setAgentRequests] = useState<AgentBillingRequestAdmin[]>([]);
  const [agentRequestCount, setAgentRequestCount] = useState(0);
  const [agentList, setAgentList] = useState<AgentListItem[]>([]);
  const [agentCustomerLinks, setAgentCustomerLinks] = useState<Record<string, { agent_id: string; agent_name: string | null; agent_email: string }>>({});
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [agentListSubTab, setAgentListSubTab] = useState<"active" | "suspended">("active");
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [dashStats, setDashStats] = useState<DashboardStats | null>(null);
  const [dashLoading, setDashLoading] = useState(false);
  // Collections state
  const [collections, setCollections] = useState<AgentCollectionItem[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [clearingBalance, setClearingBalance] = useState<string | null>(null); // agentId being cleared
  const [confirmClear, setConfirmClear] = useState<AgentCollectionItem | null>(null);
  const [expandedCollection, setExpandedCollection] = useState<string | null>(null);
  // Create Agent form state
  const [agentEmail, setAgentEmail] = useState("");
  const [agentName, setAgentName] = useState("");
  const [agentPhone, setAgentPhone] = useState("");
  const [adminMyPassword, setAdminMyPassword] = useState("");
  const [agentMsg, setAgentMsg] = useState<{ text: string; type: "ok" | "err" } | null>(null);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const dashboardIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const watchingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate("/");
  }, [loading, user, isAdmin, navigate]);

  const refreshCounts = useCallback(async () => {
    const entries = await Promise.all(
      STATUS_TABS.map(async (s) => [s, await countByStatus(s)] as const)
    );
    setCounts(Object.fromEntries(entries) as Record<UserStatus, number>);
  }, []);

  const refreshRows = useCallback(async (status: UserStatus) => {
    setRows(await fetchUsersByStatus(status));
  }, []);

  const refreshUpcomingRenewals = useCallback(async () => {
    const now = new Date().toISOString();
    const in5Days = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const { data, count } = await supabase
      .from("profiles")
      .select("*", { count: "exact" })
      .eq("status", "approved")
      .neq("role", "agent")
      .neq("email", "kellymarshall2026@gmail.com")
      .lte("subscription_expires_at", in5Days)
      .gte("subscription_expires_at", now)
      .order("subscription_expires_at", { ascending: true });
    setUpcomingRenewals((data as AdminUser[]) ?? []);
    setRenewalCount(count ?? 0);
  }, []);

  const loadWatching = useCallback(async () => {
    const staleDate = new Date(Date.now() - 30 * 1000).toISOString();
    const { data } = await supabase
      .from("active_watches")
      .select("*, profiles(full_name, email, plan)")
      .gte("last_ping", staleDate)
      .order("started_at", { ascending: false });
    const rows = (data ?? []) as any[];
    setWatchingNow(rows);
    setWatchingCount(rows.length);
  }, []);

  const loadAgentRequests = useCallback(async () => {
    const [data, list, links] = await Promise.all([
      fetchPendingAgentBillingRequests(),
      fetchAgentList(),
      fetchAgentCustomerLinks(),
    ]);
    setAgentRequests(data);
    setAgentRequestCount(data.length);
    setAgentList(list);
    setAgentCustomerLinks(links);
  }, []);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setDashLoading(true);
    try {
      const stats = await fetchDashboardStats();
      setDashStats(stats);
    } finally {
      if (!silent) setDashLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    const { data, count } = await fetchPaymentHistory(page, PAGE_SIZE);
    setHistoryTotal(count);
    setPaymentHistory(data);
  }, []);

  const loadCollections = useCallback(async (silent = false) => {
    if (!silent) setCollectionsLoading(true);
    try {
      const data = await fetchAgentCollections();
      setCollections(data);
    } finally {
      if (!silent) setCollectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    setSearch("");
    refreshUpcomingRenewals();
    // Always refresh agent request count so the sidebar badge stays current
    loadAgentRequests();
    if (tab === "dashboard") { loadDashboard(); }
    else if (tab === "billing") { /* loaded above */ }
    else if (tab === "history") { setHistoryPage(1); loadHistory(1); }
    else if (tab === "watching") loadWatching();
    else if (tab === "collections") { loadCollections(); }
    else if (tab === "agent-requests" || tab === "agent-list") { /* loadAgentRequests already called above */ }
    else {
      refreshRows(tab as UserStatus);
      fetchAgentCustomerLinks().then(setAgentCustomerLinks);
    }
    refreshCounts();
  }, [tab, isAdmin, refreshRows, refreshCounts, refreshUpcomingRenewals, loadHistory, loadWatching, loadAgentRequests, loadDashboard, loadCollections]);

  useEffect(() => {
    if (tab === "history") loadHistory(historyPage);
  }, [historyPage, tab, loadHistory]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase.channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        refreshUpcomingRenewals();
        if (tabRef.current !== "billing" && tabRef.current !== "history" && tabRef.current !== "watching" && tabRef.current !== "agent-requests" && tabRef.current !== "agent-list" && tabRef.current !== "dashboard")
          refreshRows(tabRef.current as UserStatus);
        refreshCounts();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payment_history" }, () => {
        if (tabRef.current === "history") loadHistory(historyPage);
        if (tabRef.current === "dashboard") loadDashboard(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "active_watches" }, () => { 
        loadWatching();
        if (tabRef.current === "dashboard") loadDashboard(true); 
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_billing_requests" }, () => { 
        loadAgentRequests(); 
        if (tabRef.current === "dashboard") loadDashboard(true);
        if (tabRef.current === "collections") loadCollections(true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "agent_balance" }, () => {
        if (tabRef.current === "collections") loadCollections(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, refreshRows, refreshCounts, refreshUpcomingRenewals, loadHistory, loadWatching, loadAgentRequests, loadDashboard, loadCollections, historyPage]);

  // Real‑time refresh for dashboard every 3 seconds (silent)
  useEffect(() => {
    if (!isAdmin) return;
    if (tab === "dashboard") {
      dashboardIntervalRef.current = setInterval(() => {
        loadDashboard(true);
      }, 3000);
    } else {
      if (dashboardIntervalRef.current) {
        clearInterval(dashboardIntervalRef.current);
        dashboardIntervalRef.current = null;
      }
    }
    return () => {
      if (dashboardIntervalRef.current) {
        clearInterval(dashboardIntervalRef.current);
        dashboardIntervalRef.current = null;
      }
    };
  }, [isAdmin, tab, loadDashboard]);

  // Real‑time refresh for watching now every 1 second
  useEffect(() => {
    if (!isAdmin) return;
    if (tab === "watching" || tab === "dashboard") {
      watchingIntervalRef.current = setInterval(() => {
        loadWatching();
      }, 1000);
    } else {
      if (watchingIntervalRef.current) {
        clearInterval(watchingIntervalRef.current);
        watchingIntervalRef.current = null;
      }
    }
    return () => {
      if (watchingIntervalRef.current) {
        clearInterval(watchingIntervalRef.current);
        watchingIntervalRef.current = null;
      }
    };
  }, [isAdmin, tab, loadWatching]);

  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      if (tabRef.current === "watching") loadWatching();
    }, 30_000);
    return () => clearInterval(interval);
  }, [isAdmin, loadWatching]);

  const changeStatus = async (u: AdminUser, status: UserStatus) => {
    setBusy(true);
    try {
      await setUserStatus(u.id, status);
      if (tab === "billing") await refreshUpcomingRenewals();
      else if (tab === "agent-requests" || tab === "agent-list") await loadAgentRequests();
      else if (tab !== "history") await refreshRows(tab as UserStatus);
      await refreshCounts();
    } finally { setBusy(false); }
  };

  const handleApproveAgentRequest = async (req: AgentBillingRequestAdmin) => {
    setBusy(true);
    try {
      await adminApproveAgentRequest(req.id);
      await Promise.all([loadAgentRequests(), refreshCounts()]);
      if (tabRef.current === "pending") await refreshRows("pending");
    } finally { setBusy(false); }
  };

  const handleRejectAgentRequest = async (req: AgentBillingRequestAdmin) => {
    setBusy(true);
    try {
      await adminRejectAgentRequest(req.id);
      await loadAgentRequests();
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteUserRecord(confirmDelete.id);
      setConfirmDelete(null);
      if (tab === "billing") await refreshUpcomingRenewals();
      else if (tab === "agent-requests" || tab === "agent-list") await loadAgentRequests();
      else if (tab !== "history") await refreshRows(tab as UserStatus);
      await refreshCounts();
    } finally { setBusy(false); }
  };

  const switchTab = (id: AdminTab) => { setTab(id); setSidebarOpen(false); };

  if (loading || !user || !isAdmin) return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">Loading…</div>
    </AppShell>
  );

  const totalHistoryPages = Math.ceil(historyTotal / PAGE_SIZE);
  // Exclude agents from the approved/billing table — they live in Agents & Requests tab
  const tableRows = (tab === "billing" ? upcomingRenewals : rows).filter(
    (u) => !(tab === "approved" && u.role === "agent")
  );
  const q = search.trim().toLowerCase();
  const filteredTableRows = q
    ? tableRows.filter((u) =>
        (u.full_name ?? "").toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        ((u as any).phone ?? "").toLowerCase().includes(q)
      )
    : tableRows;
  const filteredHistory = q
    ? paymentHistory.filter((p) =>
        (p.full_name ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.phone ?? "").toLowerCase().includes(q) ||
        p.plan.toLowerCase().includes(q)
      )
    : paymentHistory;
  const filteredWatching = q
    ? watchingNow.filter((w) =>
        (w.profiles?.full_name ?? "").toLowerCase().includes(q) ||
        (w.profiles?.email ?? "").toLowerCase().includes(q) ||
        (w.title ?? "").toLowerCase().includes(q)
      )
    : watchingNow;

  // ── Nav items with badge counts ────────────────────────────────────────────
  const NAV_ITEMS: NavItem[] = [
    { id: "dashboard",       label: "Dashboard",          icon: <LayoutDashboard className="h-4 w-4 shrink-0" /> },
    { id: "create-agent",    label: "Create Agent",       icon: <UserPlus className="h-4 w-4 shrink-0" /> },
    { id: "pending",         label: "Pending Subs",       icon: <ShieldCheck className="h-4 w-4 shrink-0" /> },
    { id: "agent-requests",  label: "Pending Requests",   icon: <Briefcase className="h-4 w-4 shrink-0" /> },
    { id: "agent-list",      label: "Agents",             icon: <Users className="h-4 w-4 shrink-0" /> },
    { id: "collections",     label: "Collections",        icon: <Wallet className="h-4 w-4 shrink-0" /> },
    { id: "approved",        label: STATUS_LABELS["approved"],  icon: <ShieldCheck className="h-4 w-4 shrink-0" /> },
    { id: "suspended",       label: STATUS_LABELS["suspended"], icon: <Ban className="h-4 w-4 shrink-0" /> },
    { id: "expelled",        label: STATUS_LABELS["expelled"],  icon: <UserX className="h-4 w-4 shrink-0" /> },
    { id: "billing",         label: "Renewals Due",             icon: <CalendarDays className="h-4 w-4 shrink-0" /> },
    { id: "history",         label: "Payment History",          icon: <Receipt className="h-4 w-4 shrink-0" /> },
    { id: "watching",        label: "Watching Now",             icon: <Tv className="h-4 w-4 shrink-0" /> },
  ];

  const badges: Partial<Record<AdminTab, number>> = {
    pending:          counts.pending,
    approved:         counts.approved,
    suspended:        counts.suspended,
    expelled:         counts.expelled,
    billing:          renewalCount,
    watching:         watchingCount,
    "agent-requests": agentRequestCount,
    "agent-list":     agentList.length,
    "collections":    collections.filter((c) => c.balance > 0).length,
  };

  const currentLabel = NAV_ITEMS.find((n) => n.id === tab)?.label ?? "";

  return (
    <AppShell>
      {/* Outer wrapper — sits below the fixed app navbar (top-14 = 56px) */}
      <div className="min-h-screen flex flex-col pt-14">

        {/* ── Sticky mobile header bar ── */}
        <div className="sticky top-14 z-30 flex items-center gap-3 bg-[#c0001a] px-4 py-3 md:hidden shadow-md">
          <button
            onClick={() => setSidebarOpen((o) => !o)}
            className="rounded p-1 text-white focus-visible:outline-none"
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          <ShieldCheck className="h-5 w-5 text-white" />
          <span className="text-lg font-extrabold text-white">Admin Panel</span>
          <span className="ml-auto text-sm font-semibold text-white/80">{currentLabel}</span>
        </div>

        {/* ── Mobile sidebar overlay ── */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex flex-1">
          {/* ── Sidebar ── */}
          <aside className={`
            fixed inset-y-0 left-0 z-50 w-64 bg-[#c0001a] flex flex-col pt-14
            transform transition-transform duration-200
            md:sticky md:top-14 md:self-start md:h-[calc(100vh-3.5rem)] md:translate-x-0 md:pt-0 md:w-56 md:shrink-0
            ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          `}>
            {/* Desktop sidebar header */}
            <div className="hidden md:flex items-center gap-2 px-5 py-5 border-b border-black/30">
              <ShieldCheck className="h-5 w-5 text-white" />
              <span className="font-extrabold text-white text-base">Admin Panel</span>
            </div>

            {/* Nav items */}
            <nav className="flex flex-col mt-2 overflow-y-auto flex-1">
              {NAV_ITEMS.map((item) => {
                const badge = badges[item.id] ?? 0;
                const active = tab === item.id;
                const badgeColor =
                  item.id === "pending"         ? "bg-primary" :
                  item.id === "billing"         ? "bg-yellow-500 text-black" :
                  item.id === "watching"        ? "bg-green-500 text-black" :
                  item.id === "agent-requests"  ? "bg-orange-500" :
                  item.id === "agent-list"      ? "bg-orange-500" :
                  item.id === "collections"     ? "bg-yellow-400 text-black" :
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

            {/* Sidebar summary */}
            <div className="px-4 py-4 space-y-1.5 border-t border-black/30">
              <p className="text-xs font-bold text-white/60 uppercase tracking-wide">Summary</p>
              <SidebarStat label="Total subscribers" value={`${counts.approved}`} />
              <SidebarStat label="Total agents" value={`${agentList.length}`} />
              <SidebarStat label="Pending approval" value={`${counts.pending}`} />
              <SidebarStat label="Watching now" value={`${watchingCount}`} />
            </div>
          </aside>

          {/* ── Main content ── */}
          <main className="flex-1 min-w-0 px-4 py-6 sm:px-6 overflow-y-auto">

            {/* Search bar — hidden on dashboard and create-agent */}
            {tab !== "dashboard" && tab !== "create-agent" && (
            <div className="relative max-w-sm mb-6">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, email, phone…"
                className="w-full rounded-md border border-border bg-input py-2 pl-9 pr-9 text-sm outline-none focus:border-primary"
              />
              {search && (
                <button onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            )}

            {/* Refresh / Live indicator row — hidden on dashboard and create-agent */}
            {tab !== "dashboard" && tab !== "create-agent" && (
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{currentLabel}</h2>
              {tab === "watching" && (
                <span className="flex items-center gap-1.5 text-xs text-green-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                  Live
                </span>
              )}
            </div>
            )}

            {/* ── DASHBOARD TAB ── */}
            {tab === "dashboard" && (
              <div className="space-y-8 max-w-7xl">
                {dashLoading && (
                  <div className="text-muted-foreground text-sm">Loading dashboard…</div>
                )}
                {!dashLoading && dashStats && (
                  <>
                    {/* ── Hero stats row ── */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#c0001a] via-[#8b0013] to-[#1a0005] p-6 sm:p-8 shadow-[0_8px_40px_oklch(0.55_0.22_27/0.35)]">
                      {/* decorative glow */}
                      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
                      <div className="pointer-events-none absolute -bottom-8 left-8 h-40 w-40 rounded-full bg-white/5 blur-2xl" />

                      <div className="relative">
                        <div className="flex items-center gap-2 mb-1">
                          <ShieldCheck className="h-5 w-5 text-white/80" />
                          <span className="text-sm font-semibold text-white/80 uppercase tracking-widest">Admin Panel</span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-6">Overview</h1>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                          <DashCard
                            icon={<Users className="h-5 w-5 text-white/70" />}
                            label="Subscribers"
                            value={dashStats.totalSubscribers.toString()}
                          />
                          <DashCard
                            icon={<Briefcase className="h-5 w-5 text-white/70" />}
                            label="Agents"
                            value={dashStats.totalAgents.toString()}
                          />
                          <DashCard
                            icon={<UserX className="h-5 w-5 text-white/70" />}
                            label="Pending Subscribers"
                            value={dashStats.pendingSubscribersCount.toString()}
                          />
                          <DashCard
                            icon={<UserPlus className="h-5 w-5 text-white/70" />}
                            label="Pending Requests"
                            value={dashStats.pendingAgentRequestsCount.toString()}
                          />
                          <DashCard
                            icon={<TrendingUp className="h-5 w-5 text-white/70" />}
                            label="Est. Monthly Revenue"
                            value={`TT$${dashStats.totalMonthlyRevenue.toLocaleString()}`}
                            currency
                          />
                          <DashCard
                            icon={<CalendarDays className="h-5 w-5 text-white/70" />}
                            label="Est. Yearly Revenue"
                            value={`TT$${dashStats.totalYearlyRevenue.toLocaleString()}`}
                            currency
                          />
                          <DashCard
                            icon={<DollarSign className="h-5 w-5 text-white/70" />}
                            label="Your Income This Month"
                            value={`TT$${dashStats.adminMonthlyIncome.toLocaleString()}`}
                            highlight
                            currency
                          />
                          <DashCard
                            icon={<DollarSign className="h-5 w-5 text-white/70" />}
                            label="Total Income (All Time)"
                            value={`TT$${dashStats.totalAdminIncome.toLocaleString()}`}
                            currency
                          />
                          <DashCard
                            icon={<Tv className="h-5 w-5 text-white/70" />}
                            label="Live Watching Now"
                            value={dashStats.liveWatchingCount.toString()}
                          />
                          <DashCard
                            icon={<Users className="h-5 w-5 text-white/70" />}
                            label="Total Users"
                            value={(counts.approved + counts.suspended + counts.pending + counts.expelled).toString()}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── CREATE AGENT TAB ── */}
            {tab === "create-agent" && (
              <div className="max-w-lg">
                <div className="rounded-2xl bg-gradient-to-br from-[#c0001a] via-[#8b0013] to-[#1a0005] p-5 sm:p-6 mb-6 shadow-[0_8px_40px_oklch(0.55_0.22_27/0.35)]">
                  <div className="flex items-center gap-2 mb-1">
                    <UserPlus className="h-5 w-5 text-white/80" />
                    <span className="text-xs font-semibold text-white/80 uppercase tracking-widest">Admin Only</span>
                  </div>
                  <h1 className="text-xl font-extrabold text-white">Create New Agent</h1>
                  <p className="mt-1 text-sm text-white/70">
                    Creates a login account with the Agent role. No plan or subscription — agents manage customers, not subscriptions.
                  </p>
                </div>

                {agentMsg && (
                  <div className={`mb-5 rounded-md px-4 py-3 text-sm font-medium ${agentMsg.type === "ok" ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
                    {agentMsg.text}
                  </div>
                )}

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAgentMsg(null);
                    const digits = agentPhone.replace(/\D/g, "");
                    if (digits.length !== 7) {
                      setAgentMsg({ text: "Phone must be exactly 7 digits.", type: "err" });
                      return;
                    }
                    if (!adminMyPassword) {
                      setAgentMsg({ text: "Enter your admin password to stay signed in.", type: "err" });
                      return;
                    }
                    setCreatingAgent(true);
                    try {
                      await adminCreateAgent({
                        email: agentEmail.toLowerCase().trim(),
                        fullName: agentName.trim(),
                        phone: agentPhone,
                        adminEmail: user!.email!,
                        adminPassword: adminMyPassword,
                      });
                      setAgentMsg({ text: `Agent account created for ${agentName.trim()}. Temp password: 123456`, type: "ok" });
                      setAgentEmail(""); setAgentName(""); setAgentPhone(""); setAdminMyPassword("");
                      // Refresh agent list so sidebar count updates
                      await loadAgentRequests();
                    } catch (err: any) {
                      setAgentMsg({ text: err?.message ?? "Failed to create agent.", type: "err" });
                    } finally {
                      setCreatingAgent(false);
                    }
                  }}
                  className="rounded-xl border border-border bg-card p-5 sm:p-6 space-y-4"
                >
                  <AgentField label="Full Name">
                    <input
                      required
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="e.g. John Smith"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </AgentField>

                  <AgentField label="Email Address">
                    <input
                      type="email"
                      required
                      value={agentEmail}
                      onChange={(e) => setAgentEmail(e.target.value)}
                      placeholder="agent@example.com"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </AgentField>

                  <AgentField label="Phone (7 digits)">
                    <input
                      type="tel"
                      required
                      value={agentPhone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                        const formatted = digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
                        setAgentPhone(formatted);
                      }}
                      placeholder="000-0000"
                      maxLength={8}
                      inputMode="numeric"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </AgentField>

                  <div className="rounded-md bg-primary/10 border border-primary/25 px-3 py-2.5 text-xs text-primary leading-relaxed">
                    <span className="font-bold">Temporary password:</span> <span className="font-mono font-bold text-foreground">123456</span> — agent must change it after first login via Account → Change Password.
                  </div>

                  <AgentField label="Your Admin Password (keeps you signed in)">
                    <input
                      type="password"
                      required
                      value={adminMyPassword}
                      onChange={(e) => setAdminMyPassword(e.target.value)}
                      placeholder="Your login password"
                      className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  </AgentField>

                  <button
                    type="submit"
                    disabled={creatingAgent}
                    className="w-full rounded-md bg-[#c0001a] py-3 font-bold text-white hover:bg-[#a30016] disabled:opacity-60 transition"
                  >
                    {creatingAgent ? "Creating…" : "Create Agent Account"}
                  </button>
                </form>
              </div>
            )}

            {/* ── PENDING AGENT REQUESTS TAB ── */}
            {tab === "agent-requests" && (() => {
              const byAgent: Record<string, { agent_id: string; agent_name: string | null; agent_email: string; agent_phone: string | null; requests: AgentBillingRequestAdmin[]; totalAmount: number; totalAgentCut: number; totalAdminCut: number }> = {};
              for (const req of agentRequests) {
                if (!byAgent[req.agent_id]) byAgent[req.agent_id] = { agent_id: req.agent_id, agent_name: req.agent_name ?? null, agent_email: req.agent_email ?? "", agent_phone: req.agent_phone ?? null, requests: [], totalAmount: 0, totalAgentCut: 0, totalAdminCut: 0 };
                byAgent[req.agent_id].requests.push(req);
                byAgent[req.agent_id].totalAmount += req.amount ?? 0;
                byAgent[req.agent_id].totalAgentCut += req.agent_commission ?? 0;
                byAgent[req.agent_id].totalAdminCut += req.admin_amount ?? 0;
              }
              const agentGroups = Object.values(byAgent);
              return (
                <div className="space-y-4 max-w-2xl">
                  <p className="text-sm text-muted-foreground">Agents have collected the cash — approve each customer to activate their subscription.</p>
                  {agentGroups.length === 0 && <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">No pending agent requests.</div>}
                  {agentGroups.map((group) => {
                    const expanded = expandedAgent === group.agent_id;
                    return (
                      <div key={group.agent_id} className="rounded-xl border border-orange-400/40 bg-card overflow-hidden">
                        <div className="px-5 pt-4 pb-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Briefcase className="h-4 w-4 text-orange-400 shrink-0" />
                              <p className="font-bold text-base">{group.agent_name ?? group.agent_email}</p>
                              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-400">{group.requests.length} customer{group.requests.length !== 1 ? "s" : ""}</span>
                            </div>
                            {group.agent_phone && (
                              <button
                                onClick={() => {
                                  const num = group.agent_phone!.replace(/\D/g, "");
                                  if (typeof (window as any).AndroidDial !== "undefined") {
                                    (window as any).AndroidDial.call(num);
                                  } else {
                                    window.open(`tel:${num}`, "_system");
                                  }
                                }}
                                aria-label={`Call ${group.agent_name ?? "agent"}`}
                                className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-green-500 bg-green-500/10 text-green-400 transition hover:bg-green-500 hover:text-white active:scale-95">
                                <Phone className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-3">{group.agent_email}</p>
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="rounded-lg bg-muted/60 px-3 py-2 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p><p className="text-sm font-extrabold text-foreground">TT${group.totalAmount}</p></div>
                            <div className="rounded-lg bg-green-500/10 px-3 py-2 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Agent cut</p><p className="text-sm font-extrabold text-green-400">TT${group.totalAgentCut}</p></div>
                            <div className="rounded-lg bg-primary/10 px-3 py-2 text-center"><p className="text-[10px] text-muted-foreground uppercase tracking-wide">Admin cut</p><p className="text-sm font-extrabold text-primary">TT${group.totalAdminCut}</p></div>
                          </div>
                          <button onClick={() => setExpandedAgent(expanded ? null : group.agent_id)} className="flex w-full items-center justify-center py-1 text-muted-foreground hover:text-foreground transition-colors" aria-label={expanded ? "Collapse" : "Expand"}>
                            <ChevronDown className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                        {expanded && (
                          <div className="border-t border-border divide-y divide-border">
                            {group.requests.map((req) => (
                              <div key={req.id} className="px-5 py-4">
                                <div className="flex flex-wrap items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0 space-y-1 text-sm">
                                    <p className="font-semibold">{req.customer_name ?? "—"}</p>
                                    <p className="text-xs text-muted-foreground">{req.customer_email}{req.customer_phone ? ` · ${req.customer_phone}` : ""}</p>
                                    <div className="flex flex-wrap gap-3 text-xs pt-0.5">
                                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">{PLANS[req.plan as keyof typeof PLANS]?.name ?? req.plan}</span>
                                      <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground capitalize">{req.request_type.replace(/_/g, " ")}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-4 pt-1 text-xs">
                                      <span><span className="text-muted-foreground">Total: </span><span className="font-bold">TT${req.amount}</span></span>
                                      <span><span className="text-muted-foreground">Agent: </span><span className="font-bold text-green-400">TT${req.agent_commission}</span></span>
                                      <span><span className="text-muted-foreground">You: </span><span className="font-bold text-primary">TT${req.admin_amount}</span></span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-2 shrink-0">
                                    <button onClick={() => handleApproveAgentRequest(req)} disabled={busy} className="rounded-md bg-primary px-4 py-1.5 text-sm font-bold text-primary-foreground hover:bg-primary/85 disabled:opacity-60">✓ Approve</button>
                                    <button onClick={() => handleRejectAgentRequest(req)} disabled={busy} className="rounded-md border border-destructive/50 px-4 py-1.5 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60">✕ Reject</button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── AGENTS TAB ── */}
            {tab === "agent-list" && (() => {
              const activeAgents = agentList.filter((a) => a.status === "approved");
              const suspendedAgents = agentList.filter((a) => a.status === "suspended");
              const displayAgents = agentListSubTab === "active" ? activeAgents : suspendedAgents;
              return (
                <div className="space-y-4 max-w-2xl">
                  <div className="flex gap-1 border-b border-border">
                    <button onClick={() => setAgentListSubTab("active")}
                      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${agentListSubTab === "active" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      Active
                      {activeAgents.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-bold text-white">{activeAgents.length}</span>}
                    </button>
                    <button onClick={() => setAgentListSubTab("suspended")}
                      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${agentListSubTab === "suspended" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      Suspended
                      {suspendedAgents.length > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-bold text-white">{suspendedAgents.length}</span>}
                    </button>
                  </div>
                  {displayAgents.length === 0 && <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">No {agentListSubTab} agents.</div>}
                  {displayAgents.map((agent) => {
                    const expanded = expandedAgent === agent.id;
                    return (
                      <div key={agent.id} className="rounded-xl border border-border bg-card overflow-hidden">
                        <div className="px-5 py-4">
                          <div className="flex items-start gap-2">
                            <button onClick={() => setExpandedAgent(expanded ? null : agent.id)} className="flex-1 min-w-0 text-left">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-semibold">{agent.full_name ?? "—"}</p>
                                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-400">{agent.customer_count} customer{agent.customer_count !== 1 ? "s" : ""}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{agent.email}{agent.phone ? ` · ${agent.phone}` : ""}</p>
                            </button>
                            <div className="shrink-0 text-right">
                              <span className="text-green-400 font-semibold text-sm">TT${agent.monthly_income}</span>
                              <p className="text-[10px] text-muted-foreground">This month</p>
                            </div>
                            <button onClick={() => setExpandedAgent(expanded ? null : agent.id)} className="rounded p-1 hover:bg-accent shrink-0" aria-label="Toggle customers">
                              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                            </button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {agent.status !== "suspended" ? (
                              <Btn onClick={() => changeStatus({ id: agent.id, email: agent.email, full_name: agent.full_name } as AdminUser, "suspended")} busy={busy}>
                                <Ban className="h-3.5 w-3.5" /> Suspend
                              </Btn>
                            ) : (
                              <Btn onClick={() => changeStatus({ id: agent.id, email: agent.email, full_name: agent.full_name } as AdminUser, "approved")} busy={busy} variant="primary">
                                <ShieldCheck className="h-3.5 w-3.5" /> Reinstate
                              </Btn>
                            )}
                            <Btn onClick={() => setConfirmDelete({ id: agent.id, email: agent.email, full_name: agent.full_name } as AdminUser)} busy={busy} variant="danger">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Btn>
                          </div>
                        </div>
                        {expanded && (
                          <div className="border-t border-border divide-y divide-border">
                            {agent.customers.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">No customers linked yet.</p>}
                            {agent.customers.map((c: any) => {
                              const rawExpiry = c.subscription_expires_at ? new Date(c.subscription_expires_at) : null;
                              const dueDate = rawExpiry ? new Date(rawExpiry.setUTCDate(rawExpiry.getUTCDate() - 1)) : null;
                              return (
                                <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-4 text-sm">
                                  <div className="min-w-0">
                                    <p className="font-medium truncate">{c.full_name ?? "—"}</p>
                                    <p className="text-xs text-muted-foreground">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
                                  </div>
                                  <div className="shrink-0 text-right space-y-0.5">
                                    <p className="text-xs">{PLANS[c.plan as keyof typeof PLANS]?.name ?? c.plan}</p>
                                    <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${c.status === "approved" ? "bg-green-500/15 text-green-400" : c.status === "pending" ? "bg-yellow-500/15 text-yellow-400" : "bg-destructive/15 text-destructive"}`}>{c.status}</span>
                                    {dueDate && <p className="text-xs text-muted-foreground">Due {dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}</p>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── COLLECTIONS TAB ── */}
            {tab === "collections" && (() => {
              const cq = search.trim().toLowerCase();
              const filtered = cq
                ? collections.filter((a) =>
                    (a.full_name ?? "").toLowerCase().includes(cq) ||
                    a.email.toLowerCase().includes(cq) ||
                    (a.phone ?? "").toLowerCase().includes(cq)
                  )
                : collections;
              const totalOwed = collections.reduce((s, a) => s + a.balance, 0);
              return (
                <div className="space-y-5 max-w-2xl">
                  {/* Header card */}
                  <div className="rounded-2xl bg-gradient-to-br from-[#c0001a] via-[#8b0013] to-[#1a0005] p-5 shadow-[0_8px_40px_oklch(0.55_0.22_27/0.35)]">
                    <div className="flex items-center gap-2 mb-1">
                      <Wallet className="h-5 w-5 text-white/80" />
                      <span className="text-xs font-semibold text-white/80 uppercase tracking-widest">Admin Collections</span>
                    </div>
                    <h1 className="text-xl font-extrabold text-white mb-3">Agent Balances</h1>
                    <div className="flex flex-wrap gap-4">
                      <div className="rounded-xl bg-black/25 px-4 py-3">
                        <p className="text-xs text-white/60 mb-0.5">Total Owed by All Agents</p>
                        <p className="text-2xl font-extrabold text-yellow-300">TT${totalOwed.toLocaleString()}</p>
                      </div>
                      <div className="rounded-xl bg-black/25 px-4 py-3">
                        <p className="text-xs text-white/60 mb-0.5">Agents with Balance Due</p>
                        <p className="text-2xl font-extrabold text-white">{collections.filter((c) => c.balance > 0).length}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-white/50">Balances accumulate as you approve sign-ups and renewals. Press "Clear Balance" after physically collecting cash from an agent.</p>
                  </div>

                  {collectionsLoading && <div className="text-muted-foreground text-sm">Loading collections…</div>}

                  {!collectionsLoading && filtered.length === 0 && (
                    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                      {cq ? `No agents match "${search}".` : "No agents found."}
                    </div>
                  )}

                  {/* Agent accordion cards */}
                  {!collectionsLoading && filtered.map((agent) => {
                    const expanded = expandedCollection === agent.agent_id;
                    const hasBalance = agent.balance > 0;
                    return (
                      <div key={agent.agent_id} className={`rounded-xl border bg-card overflow-hidden ${hasBalance ? "border-yellow-500/40" : "border-border"}`}>
                        <div className="px-5 py-4">
                          {/* Agent header */}
                          <button
                            onClick={() => setExpandedCollection(expanded ? null : agent.agent_id)}
                            className="w-full text-left"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-semibold">{agent.full_name ?? "—"}</p>
                                  <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-orange-400">
                                    {agent.customer_count} customer{agent.customer_count !== 1 ? "s" : ""}
                                  </span>
                                  {agent.status === "suspended" && (
                                    <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-bold text-destructive">Suspended</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {agent.email}{agent.phone ? ` · ${agent.phone}` : ""}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className={`text-lg font-extrabold ${hasBalance ? "text-yellow-400" : "text-muted-foreground"}`}>
                                  TT${agent.balance.toLocaleString()}
                                </p>
                                <p className="text-[10px] text-muted-foreground">Balance due</p>
                              </div>
                              <ChevronDown className={`h-5 w-5 text-muted-foreground shrink-0 transition-transform self-center ${expanded ? "rotate-180" : ""}`} />
                            </div>
                          </button>

                          {/* Clear balance button */}
                          {hasBalance && (
                            <div className="mt-3">
                              <button
                                disabled={clearingBalance === agent.agent_id}
                                onClick={() => setConfirmClear(agent)}
                                className="flex items-center gap-1.5 rounded-md bg-yellow-500/15 border border-yellow-500/40 px-3 py-1.5 text-xs font-semibold text-yellow-400 hover:bg-yellow-500/25 disabled:opacity-50 transition"
                              >
                                <DollarSign className="h-3.5 w-3.5" />
                                {clearingBalance === agent.agent_id ? "Clearing…" : "Clear Balance (Cash Collected)"}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Expanded breakdown */}
                        {expanded && (
                          <div className="border-t border-border divide-y divide-border">
                            <div className="px-5 py-3 grid grid-cols-3 gap-2 bg-muted/30">
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">This Month</p>
                                <p className="font-bold text-sm text-primary">TT${agent.this_month_admin.toLocaleString()}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">All-Time Owed</p>
                                <p className="font-bold text-sm">TT${agent.all_time_owed.toLocaleString()}</p>
                              </div>
                              <div className="text-center">
                                <p className="text-xs text-muted-foreground">Running Balance</p>
                                <p className={`font-bold text-sm ${hasBalance ? "text-yellow-400" : "text-muted-foreground"}`}>TT${agent.balance.toLocaleString()}</p>
                              </div>
                            </div>
                            <div className="px-5 py-3 text-xs text-muted-foreground">
                              Last updated: {new Date(agent.updated_at).toLocaleString("en-TT")}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── WATCHING NOW TAB ── */}
            {tab === "watching" && (
              <div className="space-y-3 max-w-2xl">
                <p className="text-sm text-muted-foreground">Users actively watching right now (pinged in the last 5 minutes).</p>
                {watchingNow.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">Nobody is watching right now.</div>
                )}
                {watchingNow.length > 0 && filteredWatching.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">No results for "{search}".</div>
                )}
                {filteredWatching.map((w) => (
                  <div key={w.id} className="rounded-xl border border-border bg-card p-5">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{w.profiles?.full_name ?? "—"}</p>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                          {PLANS[w.profiles?.plan as keyof typeof PLANS]?.name ?? w.profiles?.plan ?? "—"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{w.profiles?.email ?? "—"}</p>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{w.title ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{w.media_type ?? "—"}</span>
                          <span className="text-muted-foreground">
                            {w.started_at ? new Date(w.started_at).toLocaleTimeString("en-TT", { hour: "2-digit", minute: "2-digit" }) : "—"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── PAYMENT HISTORY TAB ── */}
            {tab === "history" && (
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {historyTotal} total payment{historyTotal !== 1 ? "s" : ""} · Page {historyPage} of {totalHistoryPages || 1}
                  </p>
                  {totalHistoryPages > 1 && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}
                        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent">
                        <ChevronLeft className="h-4 w-4" /> Prev
                      </button>
                      <button onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))} disabled={historyPage >= totalHistoryPages}
                        className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent">
                        Next <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
                {paymentHistory.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">No payment records yet.</div>
                )}
                {paymentHistory.length > 0 && filteredHistory.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">No results for "{search}".</div>
                )}

                {/* ── Summary row ── */}
                {filteredHistory.length > 0 && (
                  <div className="rounded-xl bg-primary/10 border border-primary/20 px-5 py-3 flex flex-wrap gap-6 text-sm">
                    <div>
                      <span className="text-muted-foreground">Showing </span>
                      <span className="font-bold">{filteredHistory.length}</span>
                      <span className="text-muted-foreground"> records</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total collected: </span>
                      <span className="font-bold text-primary">
                        TT${filteredHistory.reduce((sum, p) => sum + (p.amount ?? 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Admin cut: </span>
                      <span className="font-bold text-green-400">
                        TT${filteredHistory.reduce((sum, p) => sum + ((p as any).admin_amount ?? p.amount ?? 0), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {filteredHistory.map((p) => {
                    const isAgentPayment = !!(p as any).agent_id;
                    const adminPortion = (p as any).admin_amount ?? p.amount;
                    const agentCut = (p as any).agent_commission ?? 0;
                    return (
                      <div key={p.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          {/* Left: subscriber info */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold">{p.full_name ?? <span className="text-muted-foreground italic">Deleted user</span>}</p>
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
                                {PLANS[p.plan as keyof typeof PLANS]?.name ?? p.plan}
                              </span>
                              {isAgentPayment && (
                                <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-400 flex items-center gap-1">
                                  <Briefcase className="h-3 w-3" /> Via Agent
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {p.email}{p.phone ? ` · ${p.phone}` : ""}
                            </p>
                            {isAgentPayment && (
                              <p className="text-xs text-muted-foreground">
                                Agent: <span className="font-semibold text-foreground">{(p as any).agent_name ?? (p as any).agent_email ?? "—"}</span>
                              </p>
                            )}
                            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-0.5">
                              <span>
                                <span className="font-semibold text-foreground">Period: </span>
                                {new Date(p.period_start).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                                {" – "}
                                {new Date(p.period_end).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                              <span>
                                <span className="font-semibold text-foreground">Approved: </span>
                                {new Date(p.approved_at).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                                {" "}
                                {new Date(p.approved_at).toLocaleTimeString("en-TT", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            </div>
                          </div>
                          {/* Right: amounts */}
                          <div className="shrink-0 text-right space-y-0.5">
                            <p className="text-lg font-extrabold text-green-400">TT${p.amount}</p>
                            {isAgentPayment && agentCut > 0 && (
                              <>
                                <p className="text-xs text-muted-foreground">Agent: <span className="text-orange-400 font-semibold">TT${agentCut}</span></p>
                                <p className="text-xs text-muted-foreground">You: <span className="text-primary font-semibold">TT${adminPortion}</span></p>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totalHistoryPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}
                      className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent">
                      <ChevronLeft className="h-4 w-4" /> Prev
                    </button>
                    <span className="text-sm text-muted-foreground">{historyPage} / {totalHistoryPages}</span>
                    <button onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))} disabled={historyPage >= totalHistoryPages}
                      className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent">
                      Next <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── USER / RENEWALS ACCORDION (pending, approved, suspended, expelled, billing) ── */}
            {tab !== "history" && tab !== "agents" && tab !== "agent-requests" && tab !== "agent-list" && tab !== "watching" && tab !== "dashboard" && tab !== "create-agent" && (
              <div className="space-y-3 max-w-2xl">
                {tab === "billing" && (
                  <p className="text-sm text-muted-foreground">
                    Approved subscribers due within 5 days. Collect cash, then hit Approve to reset their cycle.
                  </p>
                )}
                {filteredTableRows.length === 0 && (
                  <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
                    {q
                      ? `No results for "${search}".`
                      : tab === "billing"
                        ? "No upcoming renewals in the next 5 days."
                        : `No ${STATUS_LABELS[tab as UserStatus]?.toLowerCase()} users.`}
                  </div>
                )}
                {filteredTableRows.map((u) => {
                  const rawExpiry = u.subscription_expires_at ? new Date(u.subscription_expires_at) : null;
                  const dueDate = rawExpiry ? new Date(rawExpiry.setUTCDate(rawExpiry.getUTCDate() - 1)) : null;
                  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                  const agentLink = agentCustomerLinks[u.id];
                  const expanded = expandedUser === u.id;
                  return (
                    <div key={u.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{u.full_name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              {agentLink && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-400">
                                  <Briefcase className="h-3 w-3" />
                                  Agent: {agentLink.agent_name ?? agentLink.agent_email}
                                </span>
                              )}
                              {(u as any).phone && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{(u as any).phone}</span>
                              )}
                              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">
                                {PLANS[u.plan as keyof typeof PLANS]?.name ?? u.plan} · TT${PLANS[u.plan as keyof typeof PLANS]?.price ?? "?"}/{PLANS[u.plan as keyof typeof PLANS]?.annual ? "yr" : "mo"}
                              </span>
                              {tab !== "pending" && dueDate && (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  tab === "billing" && daysLeft !== null && daysLeft <= 1
                                    ? "bg-destructive/15 text-destructive"
                                    : "bg-yellow-500/15 text-yellow-400"
                                }`}>
                                  {tab === "billing"
                                    ? (daysLeft! === 0 ? "Due today" : daysLeft! < 0 ? "Overdue" : `${daysLeft!}d left`)
                                    : `Renews ${dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => setExpandedUser(expanded ? null : u.id)}
                            className="shrink-0 rounded p-1 hover:bg-accent"
                            aria-label="Toggle actions"
                          >
                            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
                          </button>
                        </div>
                      </div>
                      {expanded && (
                        <div className="border-t border-border px-4 pb-4 pt-3">
                          <div className="flex flex-wrap gap-2">
                            {(tab === "pending" || tab === "billing") && (
                              <Btn onClick={() => changeStatus(u, "approved")} busy={busy} variant="primary">
                                <ShieldCheck className="h-3.5 w-3.5" /> Approve
                              </Btn>
                            )}
                            {tab === "approved" && (
                              <Btn onClick={() => changeStatus(u, "suspended")} busy={busy}>
                                <Ban className="h-3.5 w-3.5" /> Suspend
                              </Btn>
                            )}
                            {tab === "approved" && u.role === "agent" && (
                              <Btn onClick={async () => { setBusy(true); try { await removeUserAgent(u.id); await refreshRows("approved"); await refreshCounts(); } finally { setBusy(false); } }} busy={busy}>
                                <UserX className="h-3.5 w-3.5" /> Remove Agent
                              </Btn>
                            )}
                            {tab === "suspended" && (
                              <Btn onClick={() => changeStatus(u, "approved")} busy={busy} variant="primary">
                                <ShieldCheck className="h-3.5 w-3.5" /> Reactivate
                              </Btn>
                            )}
                            {(tab === "suspended" || tab === "pending" || tab === "billing") && (
                              <Btn onClick={() => changeStatus(u, "expelled")} busy={busy}>
                                <UserX className="h-3.5 w-3.5" /> Expel
                              </Btn>
                            )}
                            <Btn onClick={() => setConfirmDelete(u)} busy={busy} variant="danger">
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </Btn>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

          </main>
        </div>
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {confirmDelete?.email}'s record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmClear} onOpenChange={(o) => !o && setConfirmClear(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear balance for {confirmClear?.full_name ?? confirmClear?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark TT${confirmClear?.balance?.toLocaleString() ?? 0} as collected and reset their balance to zero.
              Only press this after you have physically received the cash from the agent. This action is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmClear) return;
                setClearingBalance(confirmClear.agent_id);
                setConfirmClear(null);
                try {
                  await clearAgentBalance(confirmClear.agent_id);
                  await loadCollections();
                } finally {
                  setClearingBalance(null);
                }
              }}
              className="bg-yellow-500 text-black hover:bg-yellow-400"
            >
              Yes, cash collected — clear balance
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

// ── Shared helper components ────────────────────────────────────────────────

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-white/70">{label}</span>
      <span className="text-xs font-bold text-white">{value}</span>
    </div>
  );
}

function DashCard({ icon, label, value, highlight, currency }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  currency?: boolean;
}) {
  return (
    <div className={`rounded-xl p-4 space-y-1 ${highlight ? "bg-white/15 ring-1 ring-white/30" : "bg-black/25"}`}>
      <div className="flex items-center gap-1.5 text-white/70">{icon}<span className="text-xs font-semibold leading-tight">{label}</span></div>
      <p className={`font-extrabold break-all leading-tight ${highlight ? "text-white" : "text-white/90"} ${currency ? "text-sm" : "text-xl"}`}>
        {value}
      </p>
    </div>
  );
}

function AgentField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Btn({ children, onClick, busy, variant = "default" }: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  variant?: "default" | "primary" | "danger";
}) {
  const styles =
    variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/85"
    : variant === "danger" ? "border border-destructive/50 text-destructive hover:bg-destructive/10"
    : "border border-border hover:bg-accent";
  return (
    <button onClick={onClick} disabled={busy}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${styles}`}>
      {children}
    </button>
  );
}
