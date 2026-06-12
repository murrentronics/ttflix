import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Monitor } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, PLANS, type PlanId } from "@/lib/supabase";
import { AppShell } from "@/components/AppShell";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — TTFlix" }] }),
  component: AccountPage,
});

function AccountPage() {
  const { user, profile, loading, changePlan, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [screens, setScreens] = useState(0);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (profile) setFullName(profile.full_name ?? "");
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("screens")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .then(({ count }) => setScreens(count ?? 0));
  }, [user]);

  if (loading || !user || !profile) {
    return (
      <AppShell>
        <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  const saveName = async () => {
    setSaving(true);
    await supabase.from("profiles").update({ full_name: fullName }).eq("id", user.id);
    await refreshProfile();
    setSaving(false);
    setMsg("Profile updated");
    setTimeout(() => setMsg(""), 2000);
  };

  const onPlan = async (p: PlanId) => {
    await changePlan(p);
    setMsg("Plan updated");
    setTimeout(() => setMsg(""), 2000);
  };

  const current = PLANS[profile.plan];

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8 px-4 pb-16 pt-24 sm:px-8">
        <h1 className="text-3xl font-extrabold">Account</h1>
        {msg && <p className="rounded-md bg-primary/15 px-4 py-2 text-sm text-primary">{msg}</p>}

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">Profile</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium">Full name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-border bg-input px-3 py-2 outline-none focus:border-primary"
              />
            </div>
            <p className="text-sm text-muted-foreground">Email: {profile.email}</p>
            <p className="text-sm text-muted-foreground">Country: {profile.country}</p>
            <button
              onClick={saveName}
              disabled={saving}
              className="rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-2 text-lg font-bold">Screens</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Monitor className="h-4 w-4 text-primary" />
            {screens} of {current.screens} screens currently in use.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-bold">Your Plan</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.values(PLANS).map((p) => {
              const active = p.id === profile.plan;
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border p-5 ${active ? "border-primary bg-primary/10" : "border-border"}`}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold">{p.name}</h3>
                    {active && <Check className="h-5 w-5 text-primary" />}
                  </div>
                  <p className="mt-1 text-2xl font-extrabold text-primary">
                    TT${p.price}
                    <span className="text-sm font-normal text-muted-foreground">/mo</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {p.screens} screens · {p.quality}
                  </p>
                  {!active && (
                    <button
                      onClick={() => onPlan(p.id)}
                      className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85"
                    >
                      {p.price > current.price ? "Upgrade" : "Switch"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex gap-3">
          <Link
            to="/"
            className="rounded-md border border-border px-5 py-2 text-sm font-semibold hover:bg-accent"
          >
            Back to Home
          </Link>
          <button
            onClick={async () => {
              await signOut();
              navigate({ to: "/" });
            }}
            className="rounded-md bg-secondary px-5 py-2 text-sm font-semibold hover:bg-accent"
          >
            Sign Out
          </button>
        </div>
      </div>
    </AppShell>
  );
}
