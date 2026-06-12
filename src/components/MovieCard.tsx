import { Star, Plus } from "lucide-react";
import { useDetail } from "./DetailContext";
import { img, year } from "@/lib/tmdb";
import type { TmdbItem } from "@/lib/tmdb.functions";

export function MovieCard({ item }: { item: TmdbItem }) {
  const { open } = useDetail();
  const poster = img(item.poster_path ?? item.backdrop_path, "w500");

  return (
    <button
      onClick={() => open(item)}
      className="group relative w-[150px] shrink-0 overflow-hidden rounded-md bg-card text-left transition-transform duration-300 hover:z-10 hover:scale-105 hover:shadow-[var(--shadow-card)] sm:w-[180px]"
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
      <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/10 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <p className="line-clamp-2 text-sm font-semibold">{item.title}</p>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {item.vote_average > 0 && (
            <span className="flex items-center gap-1 text-primary">
              <Star className="h-3 w-3 fill-primary" />
              {item.vote_average.toFixed(1)}
            </span>
          )}
          <span>{year(item.release_date)}</span>
        </div>
        <span className="mt-2 inline-flex w-fit items-center gap-1 rounded-full bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground">
          <Plus className="h-3 w-3" /> Details
        </span>
      </div>
    </button>
  );
}
