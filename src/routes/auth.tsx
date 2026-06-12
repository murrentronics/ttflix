import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AlertCircle, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/supabase";
import { getBankDetails, type BankDetails } from "@/lib/admin";
import { BankDetailsView } from "@/components/BankDetailsView";
import heroBg from "@/assets/landing-hero.jpg";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Sign In — TTFlix" }] }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [isSignup, setIsSignup] = useState(search.mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [country, setCountry] = useState("Trinidad & Tobago");
  const [plan, setPlan] = useState<PlanId>("basic");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bankStep, setBankStep] = useState(false);
  const [bank, setBank] = useState<BankDetails | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isSignup) {
        await signUp({ email, password, fullName, country, plan });
        await signIn(email, password);
        // Final step: show bank transfer details so the user can pay.
        setBank(await getBankDetails());
        setBankStep(true);
      } else {
        await signIn(email, password);
        navigate({ to: "/" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  if (bankStep) {
    return (
      <div className="relative min-h-screen">
        <img src={heroBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-background" />
        <div className="relative mx-auto max-w-md px-4 py-10">
          <Link to="/" className="mb-8 block text-center text-3xl font-extrabold text-primary">
            TT<span className="text-foreground">FLIX</span>
          </Link>
          <div className="rounded-xl border border-border bg-card/95 p-7 backdrop-blur">
            <h1 className="text-2xl font-extrabold">Complete your payment</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You picked the <span className="text-foreground">{PLANS[plan].name}</span> plan
              (TT${PLANS[plan].price}/mo). Make a bank transfer using the details below. Your account
              stays pending until we confirm your payment.
            </p>
            <div className="mt-5">
              <BankDetailsView details={bank} />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Use your email ({email}) as the payment reference.
            </p>
            <button
              onClick={() => navigate({ to: "/" })}
              className="mt-5 w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85"
            >
              I've made my transfer — Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <img src={heroBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-background" />

      <div className="relative mx-auto max-w-md px-4 py-10">
        <Link to="/" className="mb-8 block text-center text-3xl font-extrabold text-primary">
          TT<span className="text-foreground">FLIX</span>
        </Link>

        <div className="rounded-xl border border-border bg-card/95 p-7 backdrop-blur">
          <h1 className="text-2xl font-extrabold">{isSignup ? "Create your account" : "Sign In"}</h1>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {isSignup && (
              <Field label="Full name">
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="input"
                />
              </Field>
            )}

            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </Field>

            <Field label="Password">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </Field>

            {isSignup && (
              <>
                <Field label="Country">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="input"
                  >
                    <option>Trinidad & Tobago</option>
                    <option>Other (not supported)</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    TTFlix is only available in Trinidad & Tobago.
                  </p>
                </Field>

                <div>
                  <label className="mb-2 block text-sm font-medium">Choose a plan</label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(PLANS).map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPlan(p.id)}
                        className={`rounded-lg border p-3 text-left transition ${
                          plan === p.id ? "border-primary bg-primary/10" : "border-border"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{p.name}</span>
                          {plan === p.id && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-sm text-primary">TT${p.price}/mo</p>
                        <p className="text-xs text-muted-foreground">{p.screens} screens</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
            >
              {busy ? "Please wait…" : isSignup ? "Sign Up" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "New to TTFlix?"}{" "}
            <button
              onClick={() => {
                setError("");
                setIsSignup((s) => !s);
              }}
              className="font-semibold text-foreground hover:underline"
            >
              {isSignup ? "Sign in" : "Sign up now"}
            </button>
          </p>
        </div>
      </div>

      <style>{`.input{width:100%;border-radius:0.375rem;border:1px solid var(--border);background:var(--input);padding:0.65rem 0.85rem;outline:none}.input:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}
