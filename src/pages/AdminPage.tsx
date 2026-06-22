import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Ban, UserX, ShieldCheck, RefreshCw, CalendarDays, Receipt, ChevronLeft, ChevronRight, Tv } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase, STATUS_LABELS, PLANS, type UserStatus } from "@/lib/supabase";
import {
  fetchUsersByStatus, countByStatus, setUserStatus, deleteUserRecord,
  fetchPaymentHistory, type AdminUser, type PaymentRecord,
} from "@/lib/admin";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_TABS: UserStatus[] = ["pending", "approved", "suspended", "expelled"];
type AdminTab = UserStatus | "billing" | "history" | "watching";
const PAGE_SIZE = 100;

export function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<AdminTab>("pending");
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
      .lte("subscription_expires_at", in5Days)
      .gte("subscription_expires_at", now)
      .order("subscription_expires_at", { ascending: true });
    setUpcomingRenewals((data as AdminUser[]) ?? []);
    setRenewalCount(count ?? 0);
  }, []);

  const loadWatching = useCallback(async () => {
    // Stale = no ping in last 5 min
    const staleDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("active_watches")
      .select("*, profiles(full_name, email, plan)")
      .gte("last_ping", staleDate)
      .order("started_at", { ascending: false });
    const rows = (data ?? []) as any[];
    setWatchingNow(rows);
    setWatchingCount(rows.length);
  }, []);

  const loadHistory = useCallback(async (page: number) => {
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count } = await supabase
      .from("payment_history")
      .select("*, profiles(full_name, email, phone)", { count: "exact" })
      .order("approved_at", { ascending: false })
      .range(from, to);
    setHistoryTotal(count ?? 0);
    setPaymentHistory(
      ((data ?? []) as any[]).map((r) => ({
        ...r,
        full_name: r.profiles?.full_name ?? null,
        email: r.profiles?.email ?? "—",
        phone: r.profiles?.phone ?? null,
      }))
    );
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    refreshUpcomingRenewals();
    if (tab === "billing") { /* already loaded above */ }
    else if (tab === "history") { setHistoryPage(1); loadHistory(1); }
    else if (tab === "watching") loadWatching();
    else refreshRows(tab as UserStatus);
    refreshCounts();
  }, [tab, isAdmin, refreshRows, refreshCounts, refreshUpcomingRenewals, loadHistory, loadWatching]);

  // Reset to page 1 when history page changes
  useEffect(() => {
    if (tab === "history") loadHistory(historyPage);
  }, [historyPage, tab, loadHistory]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase.channel("admin-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        refreshUpcomingRenewals();
        if (tabRef.current === "billing") { }
        else if (tabRef.current !== "history" && tabRef.current !== "watching") refreshRows(tabRef.current as UserStatus);
        refreshCounts();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "payment_history" }, () => {
        if (tabRef.current === "history") loadHistory(historyPage);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "active_watches" }, () => {
        loadWatching();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isAdmin, refreshRows, refreshCounts, refreshUpcomingRenewals, loadHistory, loadWatching, historyPage]);

  // Auto-refresh watching now every 30s so stale pings get cleared automatically
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
      else if (tab !== "history") await refreshRows(tab as UserStatus);
      await refreshCounts();
    } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteUserRecord(confirmDelete.id);
      setConfirmDelete(null);
      if (tab === "billing") await refreshUpcomingRenewals();
      else if (tab !== "history") await refreshRows(tab as UserStatus);
      await refreshCounts();
    } finally { setBusy(false); }
  };

  if (loading || !user || !isAdmin) return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">Loading…</div>
    </AppShell>
  );

  const totalHistoryPages = Math.ceil(historyTotal / PAGE_SIZE);
  const tableRows = tab === "billing" ? upcomingRenewals : rows;

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16 pt-24 sm:px-8">

        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-extrabold">Admin Panel</h1>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-2 border-b border-border">
          {STATUS_TABS.map((s) => (
            <button key={s} onClick={() => setTab(s)}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === s ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {STATUS_LABELS[s]}
              {s === "pending" && counts.pending > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                  {counts.pending}
                </span>
              )}
            </button>
          ))}
          <button onClick={() => setTab("billing")}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === "billing" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <CalendarDays className="h-4 w-4" /> Renewals
            {renewalCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1.5 text-xs font-bold text-black">
                {renewalCount}
              </span>
            )}
          </button>
          <button onClick={() => setTab("history")}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === "history" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Receipt className="h-4 w-4" /> History
          </button>
          <button onClick={() => setTab("watching")}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === "watching" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Tv className="h-4 w-4" /> Watching Now
            {watchingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-500 px-1.5 text-xs font-bold text-black">
                {watchingCount}
              </span>
            )}
          </button>
          {/* Refresh button — hidden on watching tab (auto-updates) */}
          {tab !== "watching" && (
            <button
              onClick={() => {
                if (tab === "billing") refreshUpcomingRenewals();
                else if (tab === "history") loadHistory(historyPage);
                else refreshRows(tab as UserStatus);
              }}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          )}
          {/* Live indicator — watching tab only */}
          {tab === "watching" && (
            <span className="ml-auto flex items-center gap-1.5 px-3 py-2 text-xs text-green-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              Live
            </span>
          )}
        </div>

        {tab === "billing" && (
          <p className="text-sm text-muted-foreground">
            Approved subscribers due within 5 days. Collect cash, then hit Approve to reset their 30-day cycle.
          </p>
        )}

        {/* Watching Now Tab */}
        {tab === "watching" && (
          <>
            <p className="text-sm text-muted-foreground">
              Users actively watching right now (pinged in the last 5 minutes).
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Watching</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {watchingNow.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        Nobody is watching right now.
                      </td>
                    </tr>
                  )}
                  {watchingNow.map((w) => (
                    <tr key={w.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{w.profiles?.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{w.profiles?.email ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {PLANS[w.profiles?.plan as string]?.name ?? w.profiles?.plan ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">{w.title ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">{w.media_type ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {w.started_at ? new Date(w.started_at).toLocaleTimeString("en-TT", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Payment History Tab */}
        {tab === "history" && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {historyTotal} total payment{historyTotal !== 1 ? "s" : ""} · Page {historyPage} of {totalHistoryPages || 1}
              </p>
              {totalHistoryPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                    disabled={historyPage === 1}
                    className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
                  >
                    <ChevronLeft className="h-4 w-4" /> Prev
                  </button>
                  <button
                    onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                    disabled={historyPage >= totalHistoryPages}
                    className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Plan</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Period</th>
                    <th className="px-4 py-3">Approved</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentHistory.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">No payment records yet.</td>
                    </tr>
                  )}
                  {paymentHistory.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{p.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{p.email}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.phone ?? "—"}</td>
                      <td className="px-4 py-3 capitalize">{p.plan}</td>
                      <td className="px-4 py-3 font-semibold text-primary">TT${p.amount}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(p.period_start).toLocaleDateString("en-TT", { day: "numeric", month: "short" })}
                        {" — "}
                        {new Date(p.period_end).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(p.approved_at).toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom pagination */}
            {totalHistoryPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  disabled={historyPage === 1}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
                >
                  <ChevronLeft className="h-4 w-4" /> Prev
                </button>
                <span className="text-sm text-muted-foreground">
                  {historyPage} / {totalHistoryPages}
                </span>
                <button
                  onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                  disabled={historyPage >= totalHistoryPages}
                  className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40 hover:bg-accent"
                >
                  Next <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}

        {/* Users / Renewals Table */}
        {tab !== "history" && (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">{tab === "billing" ? "Due Date" : "Renews"}</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {tab === "billing"
                        ? "No upcoming renewals in the next 5 days."
                        : `No ${STATUS_LABELS[tab as UserStatus]?.toLowerCase()} users.`}
                    </td>
                  </tr>
                )}
                {tableRows.map((u) => {
                  const dueDate = u.subscription_expires_at ? new Date(u.subscription_expires_at) : null;
                  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                  return (
                    <tr key={u.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-medium">{u.full_name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{(u as any).phone ?? "—"}</td>
                      <td className="px-4 py-3">{PLANS[u.plan]?.name ?? u.plan} · TT${PLANS[u.plan]?.price ?? "?"}/{PLANS[u.plan]?.annual ? "yr" : "mo"}</td>
                      <td className="px-4 py-3">
                        {dueDate ? (
                          <div>
                            <p>{dueDate.toLocaleDateString("en-TT", { day: "numeric", month: "short", year: "numeric" })}</p>
                            {daysLeft !== null && tab === "billing" && (
                              <p className={`text-xs font-semibold ${daysLeft <= 1 ? "text-destructive" : "text-yellow-500"}`}>
                                {daysLeft === 0 ? "Due today" : daysLeft < 0 ? "Overdue" : `${daysLeft}d left`}
                              </p>
                            )}
                          </div>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
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
                          {tab === "suspended" && (
                            <Btn onClick={() => changeStatus(u, "approved")} busy={busy} variant="primary">
                              <ShieldCheck className="h-3.5 w-3.5" /> Reactivate
                            </Btn>
                          )}
                          {tab !== "expelled" && (
                            <Btn onClick={() => changeStatus(u, "expelled")} busy={busy}>
                              <UserX className="h-3.5 w-3.5" /> Expel
                            </Btn>
                          )}
                          <Btn onClick={() => setConfirmDelete(u)} busy={busy} variant="danger">
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Btn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
    </AppShell>
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
