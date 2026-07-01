import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CreditCard, CheckCircle, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase, PLANS } from "@/lib/supabase";

export function BillingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!user || !profile) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
          <div className="flex items-center gap-3">
            <CreditCard className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-extrabold">Subscribe to TTFlix</h1>
          </div>
          <p className="text-muted-foreground">Contact a TTFlix agent to create your account.</p>
          <Link to="/auth"
            className="inline-block rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85">
            Sign In
          </Link>
        </div>
      </AppShell>
    );
  }

  if (profile.status === "expelled") {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
          <h1 className="text-3xl font-extrabold">Account Removed</h1>
          <p className="text-muted-foreground">Your account has been removed. Please contact support.</p>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        </div>
      </AppShell>
    );
  }

  const plan = PLANS[profile.plan];
  // First-time subscriber = never had a subscription date set
  const isFirstTime = !profile.subscription_expires_at;

  const handleSubscribe = async () => {
    setBusy(true);
    try {
      await supabase.from("profiles").update({ status: "pending" }).eq("id", user.id);
      await refreshProfile();
      setDone(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
        <div className="flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-extrabold">Billing</h1>
        </div>

        {/* Plan summary */}
        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-3 text-lg font-bold">Your Plan</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-semibold">{plan.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monthly cost</span>
              <span className="font-semibold text-primary">TT${plan.price}/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Screens</span>
              <span>{plan.screens} · {plan.quality}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <span className={`font-semibold capitalize ${
                profile.status === "approved" ? "text-green-500"
                : profile.status === "pending" ? "text-yellow-500"
                : "text-destructive"
              }`}>
                {profile.status}
              </span>
            </div>
            {profile.subscription_expires_at && (
              <div className="flex justify-between items-center pt-1 border-t border-border">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <CalendarDays className="h-4 w-4" /> Next billing date
                </span>
                <span className="font-semibold">
                  {new Date(profile.subscription_expires_at).toLocaleDateString("en-TT", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* First-time subscribe OR request sent confirmation */}
        {isFirstTime && (
          done || profile.status === "pending" ? (
            <section className="rounded-xl border border-primary/30 bg-primary/5 p-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-6 w-6 text-primary" />
                <h2 className="text-lg font-bold text-primary">Request received</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Your subscription request has been sent. An admin will collect your payment and activate your account — usually within a few hours.
              </p>
            </section>
          ) : (
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-2 text-lg font-bold">Activate your account</h2>
              <p className="mb-5 text-sm text-muted-foreground">
                Tap below to request your subscription. An admin will reach out to collect your TT${plan.price} monthly cash payment and activate your access.
              </p>
              <button
                onClick={handleSubscribe}
                disabled={busy}
                className="w-full rounded-md bg-primary py-3 text-base font-bold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
              >
                {busy ? "Sending request…" : "Subscribe Now"}
              </button>
              <p className="mt-3 text-center text-xs text-muted-foreground">
                Cash payment collected by admin · TT${plan.price}/month
              </p>
            </section>
          )
        )}

        {/* Suspended — show note, no button needed (renewal is auto-triggered) */}
        {!isFirstTime && profile.status === "suspended" && (
          <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
            <h2 className="mb-2 text-lg font-bold text-destructive">Subscription lapsed</h2>
            <p className="text-sm text-muted-foreground">
              Your subscription has expired. Your admin has been notified and will collect your renewal payment. Your access will be restored once payment is confirmed.
            </p>
          </section>
        )}

        {/* Pending renewal notice (returning subscriber) */}
        {!isFirstTime && profile.status === "pending" && (
          <section className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-yellow-500" />
              <h2 className="text-lg font-bold text-yellow-500">Renewal in progress</h2>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Your renewal is being processed. An admin will collect your payment and reactivate your account shortly.
            </p>
          </section>
        )}

        <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-foreground">← Back to browsing</Link>
      </div>
    </AppShell>
  );
}
