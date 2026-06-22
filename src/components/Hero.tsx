import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Info, Star, Lock } from "lucide-react";
import { useDetail } from "./DetailContext";
import { useAuth } from "@/lib/auth";
import { img } from "@/lib/tmdb";
import type { TmdbItem } from "@/lib/tmdb.functions.app";

export function Hero({ items }: { items: TmdbItem[] }) {
  const [index, setIndex] = useState(0);
  const { open } = useDetail();
  const navigate = useNavigate();
  const { user, profile, isAdmin } = useAuth();

  const canWatch = isAdmin || (!!user && profile?.status === "approved");

  useEffect(() => {
    if (items.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 8000);
    return () => clearInterval(t);
  }, [items.length]);

  const item = items[index];
  if (!item) return null;

  const handlePlay = () => {
    if (!canWatch) { navigate("/"); return; }
    navigate(`/watch/${item.media_type}/${item.id}?title=${encodeURIComponent(item.title)}&poster=${encodeURIComponent(item.poster_path ?? "")}&backdrop=${encodeURIComponent(item.backdrop_path ?? "")}&season=1&episode=1&startOver=1`);
  };

  return (
    <div className="relative h-[62vh] min-h-[420px] w-full sm:h-[78vh]">
      <img
        src={img(item.backdrop_path ?? item.poster_path, "original")}
        alt={item.title}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero)" }} />
      <div className="absolute inset-0" style={{ background: "var(--gradient-hero-left)" }} />

      <div className="absolute bottom-[18%] left-0 max-w-2xl px-4 sm:px-8">
        <h1 className="text-balance text-3xl font-extrabold drop-shadow-lg sm:text-5xl md:text-6xl">
          {item.title}
        </h1>
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1 text-primary">
            <Star className="h-4 w-4 fill-primary" /> {item.vote_average.toFixed(1)}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 text-xs uppercase text-muted-foreground">
            {item.media_type}
          </span>
        </div>
        <p className="mt-3 line-clamp-3 text-sm text-foreground/85 sm:text-base">{item.overview}</p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={handlePlay}
            className="flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 font-semibold text-primary-foreground transition hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            {canWatch ? <Play className="h-5 w-5 fill-current" /> : <Lock className="h-5 w-5" />}
            {canWatch ? "Play" : "Unlock"}
          </button>
          <button
            onClick={() => open(item)}
            className="flex items-center gap-2 rounded-md bg-secondary/80 px-6 py-2.5 font-semibold backdrop-blur transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <Info className="h-5 w-5" /> More Info
          </button>
        </div>

        {/* Dots sit below the buttons, inside the hero, well above the content overlap */}
        {items.length > 1 && (
          <div className="mt-5 flex justify-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={`h-1 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${i === index ? "w-6 bg-primary" : "w-3 bg-foreground/40"}`}
                aria-label={`Slide ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
