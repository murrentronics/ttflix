import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MovieCard } from "./MovieCard";
import type { TmdbItem } from "@/lib/tmdb.functions";

export function MovieRow({ title, items }: { title: string; items: TmdbItem[] }) {
  const ref = useRef<HTMLDivElement>(null);
  if (!items?.length) return null;

  const scroll = (dir: 1 | -1) => {
    ref.current?.scrollBy({ left: dir * (ref.current.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <section className="group/row relative mb-8">
      <h2 className="mb-3 px-4 text-lg font-bold sm:px-8 md:text-xl">{title}</h2>
      <button
        onClick={() => scroll(-1)}
        className="absolute left-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-r from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex"
        aria-label="Scroll left"
      >
        <ChevronLeft className="h-8 w-8" />
      </button>
      <div ref={ref} className="row-scroll flex gap-3 overflow-x-auto px-4 pb-2 sm:px-8">
        {items.map((item) => (
          <MovieCard key={`${item.media_type}-${item.id}`} item={item} />
        ))}
      </div>
      <button
        onClick={() => scroll(1)}
        className="absolute right-0 top-1/2 z-10 hidden h-32 -translate-y-1/2 items-center bg-gradient-to-l from-background/90 to-transparent px-2 opacity-0 transition-opacity group-hover/row:opacity-100 md:flex"
        aria-label="Scroll right"
      >
        <ChevronRight className="h-8 w-8" />
      </button>
    </section>
  );
}
