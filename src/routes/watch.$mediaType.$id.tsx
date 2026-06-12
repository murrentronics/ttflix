import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { streamUrl } from "@/lib/stream";

export const Route = createFileRoute("/watch/$mediaType/$id")({
  head: () => ({ meta: [{ title: "Watch — TTFlix" }] }),
  component: WatchPage,
});

function WatchPage() {
  const { mediaType, id } = Route.useParams();
  const { user, profile, loading, isAdmin } = useAuth();
  const navigate = useNavigate();

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const src = streamUrl(type, tmdbId);

  // Admins stream unlimited regardless of plan/approval.
  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  useEffect(() => {
    if (loading) return;
    if (isAdmin) return;
    // No account, or account not approved → send to billing/payment.
    if (!user || (profile && profile.status !== "approved")) {
      navigate({ to: "/billing" });
    }
  }, [loading, user, profile, isAdmin, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!canWatch) return null;

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
          <ArrowLeft className="h-5 w-5" /> Back to TTFlix
        </Link>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-foreground/60 hover:text-foreground"
        >
          Open player in new tab
        </a>
      </div>
      <div className="flex flex-1 items-center justify-center px-2 pb-6">
        <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-lg border border-border bg-card">
          <iframe
            src={src}
            title="Player"
            className="h-full w-full"
            referrerPolicy="origin"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
