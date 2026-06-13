import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, Ban, UserX, CreditCard } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getHomeFeed } from "@/lib/tmdb.functions";
import { Landing } from "@/components/Landing";
import { AppShell } from "@/components/AppShell";
import { Browse } from "@/components/Browse";
import type { UserStatus } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading, profileLoading, profile, isAdmin } = useAuth();

  // Wait for both auth session AND profile row
  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) return <Landing />;

  // Admin bypasses all status gates
  if (isAdmin) return <HomeFeed />;

  const status = profile?.status;

  if (status !== "approved") {
    return <StatusWall status={status ?? "pending"} />;
  }

  return <HomeFeed />;
}

function HomeFeed() {
  const { data, isLoading } = useQuery({
    queryKey: ["home-feed"],
    queryFn: () => getHomeFeed(),
  });

  return (
    <AppShell>
      {isLoading || !data ? (
        <div className="flex min-h-[60vh] items-center justify-center pt-20 text-muted-foreground">
          Loading content…
        </div>
      ) : (
        <Browse feed={data} />
      )}
    </AppShell>
  );
}

const STATUS_CONFIG: Record<
  UserStatus,
  { icon: React.ReactNode; title: string; body: string; cta?: { label: string; to: string } }
> = {
  pending: {
    icon: <Clock className="h-12 w-12 text-primary" />,
    title: "Payment pending approval",
    body: "We've received your transfer request. An admin will verify your payment and activate your account — usually within a few hours. This page will update automatically the moment you're approved.",
    cta: { label: "View bank transfer details", to: "/billing" },
  },
  suspended: {
    icon: <Ban className="h-12 w-12 text-yellow-500" />,
    title: "Subscription suspended",
    body: "Your subscription has lapsed. Make a new bank transfer to restore access — once confirmed your account will be reactivated automatically.",
    cta: { label: "Renew subscription", to: "/billing" },
  },
  expelled: {
    icon: <UserX className="h-12 w-12 text-destructive" />,
    title: "Account removed",
    body: "Your account has been removed from TTFlix. Please contact support if you believe this is a mistake.",
  },
  // approved is never shown via StatusWall
  approved: {
    icon: null,
    title: "",
    body: "",
  },
};

function StatusWall({ status }: { status: UserStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
      <div className="mb-6">{cfg.icon}</div>
      <h1 className="text-2xl font-extrabold sm:text-3xl">{cfg.title}</h1>
      <p className="mx-auto mt-4 max-w-md text-muted-foreground">{cfg.body}</p>

      {cfg.cta && (
        <Link
          to={cfg.cta.to}
          className="mt-8 flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/85"
        >
          <CreditCard className="h-4 w-4" />
          {cfg.cta.label}
        </Link>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Logged in as {status === "expelled" ? "a removed account" : "a pending user"} — this page
        refreshes automatically.
      </p>
    </div>
  );
}
