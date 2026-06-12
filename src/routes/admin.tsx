import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Trash2, Ban, UserX, ShieldCheck, RefreshCw, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase, STATUS_LABELS, PLANS, type UserStatus } from "@/lib/supabase";
import {
  fetchUsersByStatus,
  countByStatus,
  setUserStatus,
  deleteUserRecord,
  getBankDetails,
  saveBankDetails,
  EMPTY_BANK,
  type AdminUser,
  type BankDetails,
} from "@/lib/admin";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — TTFlix" }] }),
  component: AdminPage,
});

const TABS: UserStatus[] = ["pending", "approved", "suspended", "expelled"];

function AdminPage() {
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<UserStatus>("pending");
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [counts, setCounts] = useState<Record<UserStatus, number>>({
    pending: 0,
    approved: 0,
    suspended: 0,
    expelled: 0,
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const tabRef = useRef(tab);
  tabRef.current = tab;

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate({ to: "/" });
  }, [loading, user, isAdmin, navigate]);

  const refreshCounts = useCallback(async () => {
    const entries = await Promise.all(
      TABS.map(async (s) => [s, await countByStatus(s)] as const),
    );
    setCounts(Object.fromEntries(entries) as Record<UserStatus, number>);
  }, []);

  const refreshRows = useCallback(async (status: UserStatus) => {
    setRows(await fetchUsersByStatus(status));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    refreshRows(tab);
    refreshCounts();
  }, [tab, isAdmin, refreshRows, refreshCounts]);

  // Realtime: any change to profiles refreshes the active tab + all badge counts.
  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-profiles")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => {
          refreshRows(tabRef.current);
          refreshCounts();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, refreshRows, refreshCounts]);

  const changeStatus = async (u: AdminUser, status: UserStatus) => {
    setBusy(true);
    try {
      await setUserStatus(u.id, status);
      await refreshRows(tab);
      await refreshCounts();
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await deleteUserRecord(confirmDelete.id);
      setConfirmDelete(null);
      await refreshRows(tab);
      await refreshCounts();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user || !isAdmin) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-extrabold">Admin Panel</h1>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-border">
          {TABS.map((s) => {
            const active = tab === s;
            const showBadge = s === "pending" && counts.pending > 0;
            return (
              <button
                key={s}
                onClick={() => setTab(s)}
                className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {STATUS_LABELS[s]}
                {showBadge && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
                    {counts.pending}
                  </span>
                )}
              </button>
            );
          })}
          <button
            onClick={() => {
              refreshRows(tab);
              refreshCounts();
            }}
            className="ml-auto flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {/* User table */}
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Expires</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No {STATUS_LABELS[tab].toLowerCase()} users.
                  </td>
                </tr>
              )}
              {rows.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3">{PLANS[u.plan]?.name ?? u.plan}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {u.subscription_expires_at
                      ? new Date(u.subscription_expires_at).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {tab === "pending" && (
                        <ActionBtn onClick={() => changeStatus(u, "approved")} busy={busy} variant="primary">
                          <ShieldCheck className="h-3.5 w-3.5" /> Approve
                        </ActionBtn>
                      )}
                      {tab !== "suspended" && tab !== "expelled" && (
                        <ActionBtn onClick={() => changeStatus(u, "suspended")} busy={busy}>
                          <Ban className="h-3.5 w-3.5" /> Suspend
                        </ActionBtn>
                      )}
                      {tab === "suspended" && (
                        <ActionBtn onClick={() => changeStatus(u, "approved")} busy={busy} variant="primary">
                          <ShieldCheck className="h-3.5 w-3.5" /> Reactivate
                        </ActionBtn>
                      )}
                      {tab !== "expelled" && (
                        <ActionBtn onClick={() => changeStatus(u, "expelled")} busy={busy}>
                          <UserX className="h-3.5 w-3.5" /> Expel
                        </ActionBtn>
                      )}
                      <ActionBtn onClick={() => setConfirmDelete(u)} busy={busy} variant="danger">
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </ActionBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <BankingSection />
      </div>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {confirmDelete?.email}'s record. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function ActionBtn({
  children,
  onClick,
  busy,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  variant?: "default" | "primary" | "danger";
}) {
  const styles =
    variant === "primary"
      ? "bg-primary text-primary-foreground hover:bg-primary/85"
      : variant === "danger"
        ? "border border-destructive/50 text-destructive hover:bg-destructive/10"
        : "border border-border hover:bg-accent";
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

function BankingSection() {
  const [bank, setBank] = useState<BankDetails>(EMPTY_BANK);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getBankDetails().then((d) => d && setBank({ ...EMPTY_BANK, ...d }));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveBankDetails(bank);
      setMsg("Banking details saved");
      setTimeout(() => setMsg(""), 2000);
    } finally {
      setSaving(false);
    }
  };

  const fields: { key: keyof BankDetails; label: string }[] = [
    { key: "bank_name", label: "Bank name" },
    { key: "account_name", label: "Account name" },
    { key: "account_number", label: "Account number" },
    { key: "account_type", label: "Account type" },
    { key: "branch", label: "Branch" },
  ];

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="mb-1 text-lg font-bold">Bank Transfer Details</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Shown to users at sign-up and on the billing page so they can pay by bank transfer.
      </p>
      {msg && <p className="mb-4 rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">{msg}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="mb-1.5 block text-sm font-medium">{f.label}</label>
            <input
              value={bank[f.key] ?? ""}
              onChange={(e) => setBank((b) => ({ ...b, [f.key]: e.target.value }))}
              className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
            />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium">Payment instructions (optional)</label>
        <textarea
          value={bank.instructions ?? ""}
          onChange={(e) => setBank((b) => ({ ...b, instructions: e.target.value }))}
          rows={3}
          className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
        />
      </div>
      <button
        onClick={save}
        disabled={saving}
        className="mt-4 flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
      >
        <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save details"}
      </button>
    </section>
  );
}
