import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { BankDetailsView } from "@/components/BankDetailsView";
import { useAuth } from "@/lib/auth";
import { getBankDetails, type BankDetails } from "@/lib/admin";
import { PLANS } from "@/lib/supabase";

export const Route = createFileRoute("/billing")({
  head: () => ({ meta: [{ title: "Billing — TTFlix" }] }),
  component: BillingPage,
});

function BillingPage() {
  const { user, profile } = useAuth();
  const [bank, setBank] = useState<BankDetails | null>(null);

  useEffect(() => {
    getBankDetails().then(setBank);
  }, []);

  const status = profile?.status;
  const plan = profile ? PLANS[profile.plan] : PLANS.basic;

  let heading = "Subscribe to start watching";
  let message =
    "Choose a plan and complete your bank transfer. Once your payment is confirmed by our team, your account is activated.";
  if (status === "pending") {
    heading = "Payment under review";
    message =
      "Thanks! Your account is pending approval. Make your bank transfer using the details below — we'll activate your account as soon as the payment is confirmed.";
  } else if (status === "suspended") {
    heading = "Renew your subscription";
    message =
      "Your subscription has expired and your account is suspended. Make a bank transfer below to restore access.";
  } else if (status === "expelled") {
    heading = "Account access removed";
    message = "Your account has been removed. Please contact support for assistance.";
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
        <div className="flex items-center gap-3">
          <CreditCard className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-extrabold">{heading}</h1>
        </div>
        <p className="text-muted-foreground">{message}</p>

        {!user && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-bold">Don't have an account?</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign up, pick a plan, and you'll get the bank transfer details to complete your
              payment.
            </p>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="mt-4 inline-block rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85"
            >
              Create account
            </Link>
          </div>
        )}

        {status !== "expelled" && (
          <section className="rounded-xl border border-border bg-card p-6">
            <h2 className="mb-1 text-lg font-bold">Bank Transfer Details</h2>
            {user && (
              <p className="mb-4 text-sm text-muted-foreground">
                Plan: <span className="text-foreground">{plan.name}</span> — TT${plan.price}/mo
              </p>
            )}
            <BankDetailsView details={bank} />
            <p className="mt-4 text-xs text-muted-foreground">
              Use your account email as the payment reference so we can match your transfer.
            </p>
          </section>
        )}

        <Link to="/" className="inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Back to browsing
        </Link>
      </div>
    </AppShell>
  );
}
