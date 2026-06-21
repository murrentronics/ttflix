import { Star } from "lucide-react";
import { useDetail } from "./DetailContext";
import { img, year } from "@/lib/tmdb";
import type { TmdbItem } from "@/lib/tmdb.functions.app";

export function MovieCard({ item }: { item: TmdbItem }) {
  const { open } = useDetail();
  const poster = img(item.poster_path ?? item.backdrop_path, "w500");

  return (
    <button
      onClick={() => open(item)}
      className="relative w-[150px] shrink-0 overflow-hidden rounded-md bg-card text-left sm:w-[180px]"
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
    </button>
  );
}
