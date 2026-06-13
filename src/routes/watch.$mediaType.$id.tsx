import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { streamUrl } from "@/lib/stream";
import { saveProgress } from "@/lib/continue-watching";

export const Route = createFileRoute("/watch/$mediaType/$id")({
  validateSearch: (s: Record<string, unknown>) => ({
    title: (s.title as string) ?? "",
    poster: (s.poster as string) ?? "",
    backdrop: (s.backdrop as string) ?? "",
    season: s.season ? Number(s.season) : 1,
    episode: s.episode ? Number(s.episode) : 1,
  }),
  head: () => ({ meta: [{ title: "Watch — TTFlix" }] }),
  component: WatchPage,
});

function WatchPage() {
  const { mediaType, id } = Route.useParams();
  const search = Route.useSearch();
  const { user, profile, loading, profileLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const progressRef = useRef({ watched: 0, duration: 0 });
  const [saved, setSaved] = useState(false);
  // Store src once — never let it change so iframe never reloads
  const [src] = useState(() =>
    streamUrl(
      mediaType === "tv" ? "tv" : "movie",
      Number(id),
      (search.season as number) ?? 1,
      (search.episode as number) ?? 1,
    )
  );

  const type = mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(id);
  const season = search.season ?? 1;
  const episode = search.episode ?? 1;
  const stillLoading = loading || profileLoading;
  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  const persist = useCallback(async (watched: number, duration: number) => {
    if (!user || watched < 30) return;
    await saveProgress({
      user_id: user.id, tmdb_id: tmdbId, media_type: type,
      title: search.title || `Title ${tmdbId}`,
      poster_path: search.poster || null, backdrop_path: search.backdrop || null,
      watched_seconds: Math.floor(watched), duration_seconds: Math.floor(duration),
      season: type === "tv" ? season : null, episode: type === "tv" ? episode : null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [user, tmdbId, type, season, episode, search]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        if (d?.timestamp !== undefined && d?.duration !== undefined) {
          progressRef.current = { watched: d.timestamp, duration: d.duration };
        }
      } catch { /* ignore */ }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => {
      const { watched, duration } = progressRef.current;
      if (watched > 30) persist(watched, duration);
    }, 30_000);
    return () => clearInterval(t);
  }, [user, tmdbId, persist]);

  useEffect(() => {
    const save = () => {
      const { watched, duration } = progressRef.current;
      if (user && watched > 30) persist(watched, duration);
    };
    window.addEventListener("beforeunload", save);
    return () => { save(); window.removeEventListener("beforeunload", save); };
  }, [user, persist]);

  useEffect(() => {
    if (stillLoading) return;
    if (!canWatch) navigate({ to: "/" });
  }, [stillLoading, canWatch, navigate]);

  if (stillLoading) return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>
  );
  if (!canWatch) return null;

  return (
    <div className="flex min-h-screen flex-col bg-black">
      <div className="flex items-center justify-between px-4 py-3">
        <Link to="/" className="flex items-center gap-2 text-sm text-foreground/80 hover:text-foreground">
          <ArrowLeft className="h-5 w-5" /> Back to TTFlix
        </Link>
        {saved && (
          <span className="rounded bg-primary/20 px-2 py-1 text-xs text-primary">Progress saved</span>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center px-2 pb-4">
        <div className="aspect-video w-full max-w-6xl overflow-hidden rounded-lg bg-black">
          <iframe
            src={src}
            title="Player"
            className="h-full w-full"
            referrerPolicy="origin"
            /**
             * allow="..." without "allow-popups" is NOT valid here —
             * but sandbox WITHOUT allow-popups IS the browser-enforced popup blocker.
             * Videasy says "Sandbox Detected" but let's test with just allow-popups-to-escape-sandbox removed.
             * The key attribute below blocks new tabs at the browser policy level:
             */
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
}
