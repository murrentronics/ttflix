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
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) return null;

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
          <ArrowLeft className="h-5 w-5" /> Back to TTFlix
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center px-2 pb-6">
        <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-lg border border-border bg-card">
          <iframe
            src={streamUrl(type, tmdbId)}
            title="Player"
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
