import { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Eye, EyeOff, Check, X } from "lucide-react";
import { verifyResetCode, resetPassword } from "@/lib/password-reset";
import heroBg from "@/assets/landing-hero.jpg";

// ── Password rule definitions ────────────────────────────────────────────────
const RULES = [
  {
    key: "length",
    label: "At least 8 characters",
    test: (v: string) => v.length >= 8,
  },
  {
    key: "upper",
    label: "At least 1 uppercase letter",
    test: (v: string) => /[A-Z]/.test(v),
  },
  {
    key: "number",
    label: "At least 1 number",
    test: (v: string) => /[0-9]/.test(v),
  },
  {
    key: "special",
    label: "At least 1 special character",
    test: (v: string) => /[^A-Za-z0-9]/.test(v),
  },
] as const;

function RuleRow({ passed, label }: { passed: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {passed ? (
        <Check className="h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <X className="h-4 w-4 shrink-0 text-red-500" />
      )}
      <span className={passed ? "text-green-400" : "text-red-400"}>{label}</span>
    </li>
  );
}

// ── 6-digit code input (individual boxes) ───────────────────────────────────
function CodeInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const digits = value.padEnd(6, "").split("").slice(0, 6);

  const handleKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
    idx: number,
  ) => {
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(".code-box"),
    );
    if (e.key === "Backspace") {
      const next = [...digits];
      if (next[idx] && next[idx] !== " ") {
        next[idx] = "";
      } else if (idx > 0) {
        next[idx - 1] = "";
        inputs[idx - 1]?.focus();
      }
      onChange(next.join("").replace(/ /g, ""));
    } else if (/^\d$/.test(e.key)) {
      const next = [...digits];
      next[idx] = e.key;
      onChange(next.join("").replace(/ /g, ""));
      if (idx < 5) inputs[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted);
    // Focus last filled box
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>(".code-box"),
    );
    inputs[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex justify-center gap-2">
      {digits.map((d, i) => (
        <input
          key={i}
          className="code-box h-12 w-10 rounded-lg border border-border bg-input text-center text-xl font-bold outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          maxLength={1}
          inputMode="numeric"
          value={d === " " || !d ? "" : d}
          onChange={() => {}} // controlled via onKeyDown
          onKeyDown={(e) => handleKey(e, i)}
          onPaste={handlePaste}
          autoFocus={i === 0}
        />
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
type Step = "code" | "password" | "done";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const emailParam = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(emailParam);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<Step>("code");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Rule states
  const rulePassed = RULES.map((r) => r.test(password));
  const allRulesPassed = rulePassed.every(Boolean);
  const passwordsMatch = password.length > 0 && password === confirm;

  // Auto-submit code when all 6 digits entered
  useEffect(() => {
    if (code.length === 6 && step === "code") {
      handleVerifyCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleVerifyCode = async () => {
    if (code.length !== 6) return;
    setError("");
    setBusy(true);
    try {
      // verifyOtp signs the user in — if it succeeds, go straight to password form
      await verifyResetCode(email, code);
      setStep("password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allRulesPassed || !passwordsMatch) return;
    setError("");
    setBusy(true);
    try {
      // After verifyOtp a session exists — updateUser works directly
      await resetPassword(email, code, password);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
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

          {/* ── Step 1: Enter code ── */}
          {step === "code" && (
            <>
              <h1 className="text-2xl font-extrabold">Enter Reset Code</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Enter the 6-digit code we sent to{" "}
                <span className="font-medium text-foreground">{email || "your email"}</span>.
              </p>

              {!emailParam && (
                <div className="mt-4">
                  <label className="mb-1.5 block text-sm font-medium">Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="you@example.com"
                  />
                </div>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-6">
                <CodeInput value={code} onChange={setCode} />
              </div>

              {busy && (
                <p className="mt-4 text-center text-sm text-muted-foreground">Verifying…</p>
              )}

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Didn't get a code?{" "}
                <button
                  onClick={() => navigate("/forgot-password")}
                  className="font-semibold text-foreground hover:underline"
                >
                  Resend
                </button>
              </p>
            </>
          )}

          {/* ── Step 2: New password ── */}
          {step === "password" && (
            <>
              <h1 className="text-2xl font-extrabold">New Password</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Choose a strong new password for your account.
              </p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} className="mt-5 space-y-4">
                {/* New password */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">New password</label>
                  <div className="relative">
                    <input
                      type={showPass ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input"
                      style={{ paddingRight: "2.75rem" }}
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      tabIndex={-1}
                      aria-label={showPass ? "Hide" : "Show"}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password */}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      className="input"
                      style={{ paddingRight: "2.75rem" }}
                      placeholder="Repeat new password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      tabIndex={-1}
                      aria-label={showConfirm ? "Hide" : "Show"}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* ── Validation rules (shown below confirm) ── */}
                  {(password.length > 0 || confirm.length > 0) && (
                    <ul className="mt-3 space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
                      {RULES.map((r, i) => (
                        <RuleRow key={r.key} passed={rulePassed[i]} label={r.label} />
                      ))}
                      <RuleRow
                        passed={passwordsMatch}
                        label="Passwords match"
                      />
                    </ul>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={busy || !allRulesPassed || !passwordsMatch}
                  className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-50"
                >
                  {busy ? "Updating…" : "Reset Password"}
                </button>
              </form>
            </>
          )}

          {/* ── Step 3: Done ── */}
          {step === "done" && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/15">
                <Check className="h-8 w-8 text-green-500" />
              </div>
              <div>
                <p className="text-lg font-bold">Password Updated!</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your password has been reset successfully. Sign in with your new password.
                </p>
              </div>
              <button
                onClick={() => navigate("/auth")}
                className="w-full rounded-md bg-primary py-3 font-semibold text-primary-foreground transition hover:bg-primary/85"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`.input{width:100%;border-radius:0.375rem;border:1px solid var(--border);background:var(--input);padding:0.65rem 0.85rem;outline:none}.input:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}
