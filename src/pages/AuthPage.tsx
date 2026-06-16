import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, Eye, EyeOff, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PLANS, type PlanId } from "@/lib/supabase";
import heroBg from "@/assets/landing-hero.jpg";

const PASSWORD_RULES = [
  { key: "length",  label: "At least 8 characters",      test: (v: string) => v.length >= 8 },
  { key: "upper",   label: "At least 1 uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { key: "number",  label: "At least 1 number",           test: (v: string) => /[0-9]/.test(v) },
  { key: "special", label: "At least 1 special character",test: (v: string) => /[^A-Za-z0-9]/.test(v) },
] as const;

/** Format phone as NNN-NNNN (7 digits max, auto-hyphen after 3rd digit) */
function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function AuthPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { signIn, signUp } = useAuth();

  const [isSignup, setIsSignup] = useState(searchParams.get("mode") === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("Trinidad & Tobago");
  const [plan, setPlan] = useState<PlanId>("basic");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rulePassed = PASSWORD_RULES.map((r) => r.test(password));
  const allRulesPassed = rulePassed.every(Boolean);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isSignup) {
      const digits = phone.replace(/\D/g, "");
      if (digits.length !== 7) {
        setError("Phone number must be 7 digits (e.g. 868-1234).");
        return;
      }
    }

    setBusy(true);
    try {
      if (isSignup) {
        await signUp({ email, password, fullName, phone, country, plan });
        await signIn(email, password);
        navigate("/");
      } else {
        await signIn(email, password);
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <img src={heroBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 pointer-events-none" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-background pointer-events-none" />
      <div className="relative mx-auto max-w-md px-4 py-10">
        <Link to="/" className="mb-8 block text-center text-3xl font-extrabold text-primary">TT<span className="text-foreground">FLIX</span></Link>
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
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
              </Field>
            )}
            <Field label="Email">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </Field>
            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={isSignup ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  style={{ WebkitTapHighlightColor: "transparent" }}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {/* Password validator — signup only, shows as user types */}
              {isSignup && password.length > 0 && (
                <ul className="mt-2 space-y-1 rounded-lg border border-border bg-muted/40 p-3">
                  {PASSWORD_RULES.map((r, i) => (
                    <li key={r.key} className="flex items-center gap-2 text-sm">
                      {rulePassed[i]
                        ? <Check className="h-4 w-4 shrink-0 text-green-500" />
                        : <X     className="h-4 w-4 shrink-0 text-red-500" />}
                      <span className={rulePassed[i] ? "text-green-400" : "text-red-400"}>{r.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Field>

            {isSignup && (
              <>
                <Field label="Phone number">
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={handlePhoneChange}
                    placeholder="000-0000"
                    maxLength={8}
                    inputMode="numeric"
                    className="input"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">7 digits — auto-formatted as NNN-NNNN</p>
                </Field>

                <Field label="Country">
                  <select value={country} onChange={(e) => setCountry(e.target.value)} className="input">
                    <option>Trinidad & Tobago</option>
                    <option>Other (not supported)</option>
                  </select>
                  <p className="mt-1 text-xs text-muted-foreground">TTFlix is only available in Trinidad & Tobago.</p>
                </Field>

                <div>
                  <label className="mb-2 block text-sm font-medium">Choose a plan</label>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.values(PLANS).map((p) => (
                      <button type="button" key={p.id} onClick={() => setPlan(p.id)}
                        className={`rounded-lg border p-3 text-left transition ${plan === p.id ? "border-primary bg-primary/10" : "border-border"}`}>
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

            <button type="submit" disabled={busy || (isSignup && !allRulesPassed)}
              className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60">
              {busy ? "Please wait…" : isSignup ? "Sign Up" : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-sm text-muted-foreground">
            {isSignup ? "Already have an account?" : "New to TTFlix?"}{" "}
            <button onClick={() => { setError(""); setIsSignup((s) => !s); }}
              className="font-semibold text-foreground hover:underline">
              {isSignup ? "Sign in" : "Sign up now"}
            </button>
          </p>
          {!isSignup && (
            <p className="mt-3 text-sm text-muted-foreground">
              <Link to="/forgot-password" className="font-semibold text-foreground hover:underline">
                Forgot password?
              </Link>
            </p>
          )}
          <div className="mt-6 border-t border-border pt-5">
            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-accent hover:text-foreground"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
      <style>{`.input{width:100%;border-radius:0.375rem;border:1px solid var(--border);background:var(--input);color:var(--foreground);padding:0.65rem 0.85rem;outline:none;-webkit-appearance:none;appearance:none}.input:focus{border-color:var(--primary)}.input.pr-10{padding-right:2.75rem}`}</style>
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
