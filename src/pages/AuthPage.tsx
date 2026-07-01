import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import heroBg from "@/assets/landing-hero.jpg";

export function AuthPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
      navigate("/");
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
        <Link
          to="/"
          className="mb-8 block text-center text-3xl font-extrabold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        >
          TT<span className="text-foreground">FLIX</span>
        </Link>

        <div className="rounded-xl border border-border bg-card/95 p-7 backdrop-blur">
          <h1 className="text-2xl font-extrabold">Sign In</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Accounts are created by agents only. Contact your TTFlix agent to get started.
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive-foreground">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input focus-visible:ring-2 focus-visible:ring-primary"
              />
            </Field>

            <Field label="Password">
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pr-10 focus-visible:ring-2 focus-visible:ring-primary"
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
            </Field>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <p className="mt-4 text-sm text-muted-foreground">
            <Link
              to="/forgot-password"
              className="font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
            >
              Forgot password?
            </Link>
          </p>

          <div className="mt-6 border-t border-border pt-5">
            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-semibold text-foreground/80 transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
