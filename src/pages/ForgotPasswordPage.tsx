import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, Mail, ArrowLeft } from "lucide-react";
import { requestPasswordReset } from "@/lib/password-reset";
import heroBg from "@/assets/landing-hero.jpg";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-screen">
      <img
        src={heroBg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-30 pointer-events-none"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 to-background pointer-events-none" />

      <div className="relative mx-auto max-w-md px-4 py-10">
        <Link to="/" className="mb-8 block text-center text-3xl font-extrabold text-primary">
          TT<span className="text-foreground">FLIX</span>
        </Link>

        <div className="rounded-xl border border-border bg-card/95 p-7 backdrop-blur">
          <button
            onClick={() => navigate("/auth")}
            className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Sign In
          </button>

          <h1 className="text-2xl font-extrabold">Forgot Password</h1>

          {!sent ? (
            <>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter your email and we'll send you a 6-digit reset code.
              </p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="input"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
                >
                  {busy ? "Sending…" : "Send Reset Code"}
                </button>
              </form>
            </>
          ) : (
            <div className="mt-5 space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/15">
                <Mail className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold">Check your email</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
                  It expires in 15 minutes.
                </p>
              </div>
              <button
                onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email)}`)}
                className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85"
              >
                Enter Code
              </button>
              <button
                onClick={() => { setSent(false); setError(""); }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Didn't receive it? Try again
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 text-center">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back to Home</Link>
        </div>
      </div>

      <style>{`.input{width:100%;border-radius:0.375rem;border:1px solid var(--border);background:var(--input);color:var(--foreground);padding:0.65rem 0.85rem;outline:none}.input:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}
