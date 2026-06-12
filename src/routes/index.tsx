import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { getHomeFeed } from "@/lib/tmdb.functions";
import { Landing } from "@/components/Landing";
import { AppShell } from "@/components/AppShell";
import { Browse } from "@/components/Browse";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!user) return <Landing />;

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
