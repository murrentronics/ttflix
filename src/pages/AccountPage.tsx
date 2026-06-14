import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Monitor, CreditCard, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, PLANS, type PlanId } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";
import { requestPlanUpgrade } from "@/lib/admin";

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function AccountPage() {
  const { user, profile, loading, isAdmin, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [screens, setScreens] = useState(0);
  const [msg, setMsg] = useState("");
  const [confirmPlan, setConfirmPlan] = useState<PlanId | null>(null);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => { if (!loading && !user) navigate("/auth"); }, [loading, user, navigate]);
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
    }
  }, [profile]);
  useEffect(() => {
    if (!user) return;
    // Show currently active watches (pinged in last 5 min)
    const staleDate = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    supabase.from("active_watches")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("last_ping", staleDate)
      .then(({ count }) => setScreens(count ?? 0));
  }, [user]);

  if (loading || !user || !profile) return (
    <AppShell><div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">Loading…</div></AppShell>
  );

  const saveProfile = async () => {
    const digits = phone.replace(/\D/g, "");
    if (phone && digits.length !== 7) {
      setMsg("Phone must be 7 digits.");
      return;
    }
    setSaving(true);
    await supabase.from("profiles").update({ full_name: fullName, phone: phone || null }).eq("id", user.id);
    await refreshProfile();
    setSaving(false);
    setMsg("Profile updated");
    setTimeout(() => setMsg(""), 2000);
  };

  const onPlan = async (p: PlanId) => {
    setUpgrading(true);
    try {
      await requestPlanUpgrade(user.id, p);
      await refreshProfile();
      setMsg("Plan change requested. Your plan updates once admin approves.");
    } finally {
      setUpgrading(false);
      setConfirmPlan(null);
    }
    setTimeout(() => setMsg(""), 5000);
  };

  const current = PLANS[profile.plan];

  // Plan changes are only allowed during the renewal window (5 days before expiry)
  const inRenewalWindow =
    profile.status === "approved" &&
    !!profile.subscription_expires_at &&
    (new Date(profile.subscription_expires_at).getTime() - Date.now()) <= 5 * 24 * 60 * 60 * 1000;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
        <h1 className="text-3xl font-extrabold">Account</h1>
        {msg && <p className="rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">{msg}</p>}

        {/* Profile section */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Full name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">Phone number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                placeholder="000-0000"
                maxLength={8}
                inputMode="numeric"
                className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
              />
            </div>
            <p className="text-sm text-muted-foreground">Email: {profile.email}</p>
            {!isAdmin && <p className="text-sm text-muted-foreground">Country: {profile.country}</p>}
            <button onClick={saveProfile} disabled={saving}
              className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>

        {isAdmin ? (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-2 text-lg font-bold">Administrator</h2>
            <p className="text-sm text-muted-foreground">Unlimited access — no plan or screen limits.</p>
            <Link to="/admin" className="mt-4 inline-block rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85">
              Open Admin Panel
            </Link>
          </section>
        ) : (
          <>
            {/* Billing section */}
            <section className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold">Billing</h2>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-medium">{current.name} — TT${current.price}/mo</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`font-medium capitalize ${
                    profile.status === "approved" ? "text-green-500"
                    : profile.status === "pending" ? "text-yellow-500"
                    : "text-destructive"
                  }`}>
                    {profile.status}
                  </span>
                </div>
                {profile.subscription_expires_at && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next billing date</span>
                    <span className="font-medium">
                      {new Date(profile.subscription_expires_at).toLocaleDateString("en-TT", {
                        day: "numeric", month: "long", year: "numeric"
                      })}
                    </span>
                  </div>
                )}
              </div>
              {profile.status === "pending" && (
                <p className="mt-4 rounded-md bg-yellow-500/10 px-3 py-2 text-xs text-yellow-400">
                  Your renewal is pending. An admin will collect your payment and reactivate your account shortly.
                </p>
              )}
              {profile.status === "suspended" && (
                <p className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  Your subscription has lapsed. Please contact your admin to renew.
                </p>
              )}
            </section>

            {/* Screens section */}
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-2 text-lg font-bold">Screens</h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Monitor className="h-4 w-4 text-primary" />
                {screens} of {current.screens} screens currently in use.
              </p>
            </section>

            {/* Plan section */}
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-lg font-bold">Your Plan</h2>

              {!inRenewalWindow && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Plan changes can be requested during your renewal window (5 days before expiry).
                </p>
              )}

              {profile.pending_plan && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    Your switch to <span className="font-semibold">{PLANS[profile.pending_plan as PlanId]?.name}</span> is pending admin approval. You stay on <span className="font-semibold">{current.name}</span> until then.
                  </span>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {Object.values(PLANS).map((p) => {
                  const active = p.id === profile.plan;
                  const isPending = p.id === profile.pending_plan;
                  const canRequest = inRenewalWindow && !profile.pending_plan && !active;
                  return (
                    <div key={p.id} className={`rounded-lg border p-5 ${
                      active ? "border-primary bg-primary/10"
                      : isPending ? "border-yellow-500/50 bg-yellow-500/5"
                      : "border-border"
                    }`}>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold">{p.name}</h3>
                        {active && <Check className="h-5 w-5 text-primary" />}
                        {isPending && (
                          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-semibold text-yellow-500">
                            Pending
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-2xl font-extrabold text-primary">
                        TT${p.price}<span className="text-sm font-normal text-muted-foreground">/mo</span>
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{p.screens} screens · {p.quality}</p>
                      {!active && !isPending && (
                        <button
                          onClick={() => canRequest ? setConfirmPlan(p.id) : undefined}
                          disabled={!canRequest}
                          title={!canRequest ? "Available during your renewal window only" : undefined}
                          className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {p.price > current.price ? "Upgrade" : "Switch"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Confirm plan change — simple modal (no AlertDialog dependency for Android) */}
            {confirmPlan && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
                <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
                  <h2 className="mb-2 text-lg font-bold">Request plan change?</h2>
                  <p className="mb-5 text-sm text-muted-foreground">
                    You're requesting to switch to{" "}
                    <span className="font-semibold text-foreground">
                      {PLANS[confirmPlan].name} (TT${PLANS[confirmPlan].price}/mo)
                    </span>. You'll stay on your current plan until admin approves.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setConfirmPlan(null)}
                      disabled={upgrading}
                      className="flex-1 rounded-md border border-border py-2 text-sm font-semibold hover:bg-accent disabled:opacity-60"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => onPlan(confirmPlan)}
                      disabled={upgrading}
                      className="flex-1 rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85 disabled:opacity-60"
                    >
                      {upgrading ? "Requesting…" : "Yes, request"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex gap-3">
          <Link to="/" className="rounded-md border border-border px-5 py-2 text-sm font-semibold hover:bg-accent">
            Back to Home
          </Link>
          <button
            onClick={async () => { await signOut(); navigate("/"); }}
            className="rounded-md bg-secondary px-5 py-2 text-sm font-semibold hover:bg-accent"
          >
            Sign Out
          </button>
        </div>
      </div>
    </AppShell>
  );
}
