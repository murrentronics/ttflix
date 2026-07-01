import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Receipt, ChevronLeft, TrendingUp, DollarSign, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase, PLANS } from "@/lib/supabase";

type PaymentRow = {
  id: string;
  plan: string;
  amount: number;
  period_start: string;
  period_end: string;
  approved_at: string;
};

export function PaymentHistoryPage() {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && (!user || !profile || profile.status === "pending")) navigate("/");
  }, [loading, user, profile, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("payment_history")
      .select("id, plan, amount, period_start, period_end, approved_at")
      .eq("user_id", user.id)
      .order("approved_at", { ascending: false })
      .then(({ data }) => {
        setHistory((data as PaymentRow[]) ?? []);
        setFetching(false);
      });
  }, [user]);

  if (loading || fetching) return (
    <AppShell>
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground pt-20">Loading…</div>
    </AppShell>
  );

  const totalPaid  = history.reduce((s, p) => s + (p.amount ?? 0), 0);
  const totalMonths = history.length;
  const latestPlan = history[0]?.plan ?? profile?.plan ?? "basic";
  const planName   = PLANS[latestPlan as keyof typeof PLANS]?.name ?? latestPlan.replace(/_/g, " ");

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8 pt-20 space-y-6">

        {/* Back */}
        <button
          onClick={() => navigate("/account")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ChevronLeft className="h-4 w-4" /> Back to Account
        </button>

        {/* Header card */}
        <div className="rounded-2xl bg-gradient-to-br from-[#c0001a] via-[#8b0013] to-[#1a0005] p-5 shadow-[0_8px_40px_oklch(0.55_0.22_27/0.35)]">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="h-5 w-5 text-white/80" />
            <span className="text-xs font-semibold text-white/80 uppercase tracking-widest">TTFlix</span>
          </div>
          <h1 className="text-xl font-extrabold text-white mb-4">Payment History</h1>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-black/25 px-3 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="h-4 w-4 text-white/60" />
                <p className="text-[11px] text-white/60">Total Paid</p>
              </div>
              <p className="text-xl font-extrabold text-green-300">TT${totalPaid.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarDays className="h-4 w-4 text-white/60" />
                <p className="text-[11px] text-white/60">Payments</p>
              </div>
              <p className="text-xl font-extrabold text-white">{totalMonths}</p>
            </div>
            <div className="rounded-xl bg-black/25 px-3 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="h-4 w-4 text-white/60" />
                <p className="text-[11px] text-white/60">Current Plan</p>
              </div>
              <p className="text-sm font-extrabold text-white leading-tight">{planName}</p>
            </div>
          </div>
        </div>

        {/* Records */}
        {history.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground">
            No payment records yet.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((p) => {
              const pName = PLANS[p.plan as keyof typeof PLANS]?.name ?? p.plan.replace(/_/g, " ");
              const paidOn = new Date(p.approved_at).toLocaleDateString("en-TT", {
                day: "numeric", month: "short", year: "numeric",
              });
              const periodStart = new Date(p.period_start).toLocaleDateString("en-TT", {
                day: "numeric", month: "short",
              });
              const periodEnd = new Date(p.period_end).toLocaleDateString("en-TT", {
                day: "numeric", month: "short", year: "numeric",
              });
              return (
                <div key={p.id} className="rounded-xl border border-border bg-card px-4 py-3 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm capitalize">{pName}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {periodStart} – {periodEnd}
                    </p>
                    <p className="text-xs text-muted-foreground">Paid {paidOn}</p>
                  </div>
                  <p className="text-lg font-extrabold text-green-400 shrink-0">TT${p.amount}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
