import { Star } from "lucide-react";
import { useDetail } from "./DetailContext";
import { img, year } from "@/lib/tmdb";
import type { TmdbItem } from "@/lib/tmdb.functions.app";
import { navigateVertical } from "@/lib/tv-navigation";

export function MovieCard({ item }: { item: TmdbItem }) {
  const { open } = useDetail();
  const poster = img(item.poster_path ?? item.backdrop_path, "w500");

  return (
    <button
      data-tv-card
      onClick={() => open(item)}
      onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); navigateVertical(e.currentTarget, "down"); }
        if (e.key === "ArrowUp")   { e.preventDefault(); navigateVertical(e.currentTarget, "up"); }
      }}
      className="group relative w-[150px] shrink-0 overflow-hidden rounded-md bg-card text-left
        transition-transform duration-200
        focus-visible:outline-none focus-visible:scale-105 focus-visible:z-10
        focus-visible:ring-2 focus-visible:ring-primary focus-visible:shadow-[0_0_0_2px_hsl(var(--primary))]
        sm:w-[180px]"
    >
      <div className="aspect-[2/3] w-full overflow-hidden bg-muted">
        {poster ? (
          <img
            src={poster}
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
            {item.title}
          </div>
        )}
      </div>

      {/* Title + year — always visible below poster */}
      <div className="px-1.5 py-2">
        <p className="line-clamp-1 text-xs font-semibold text-foreground">{item.title}</p>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          {item.vote_average > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Star className="h-3 w-3 fill-primary" />
              {item.vote_average.toFixed(1)}
            </span>
          )}
          <span>{year(item.release_date)}</span>
        </div>
      </div>

      {/* Focus overlay — visible on TV remote focus, invisible on touch */}
      <div className="pointer-events-none absolute inset-0 rounded-md opacity-0 ring-2 ring-primary transition-opacity duration-200 group-focus-visible:opacity-100" />
    </button>
  );
}
