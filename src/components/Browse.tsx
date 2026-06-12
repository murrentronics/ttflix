import { Hero } from "./Hero";
import { MovieRow } from "./MovieRow";
import type { TmdbItem } from "@/lib/tmdb.functions";

type Feed = {
  hero: TmdbItem[];
  rows: { title: string; items: TmdbItem[] }[];
};

export function Browse({ feed }: { feed: Feed }) {
  return (
    <>
      <Hero items={feed.hero} />
      <div className="relative z-10 -mt-16 pb-10">
        {feed.rows.map((row) => (
          <MovieRow key={row.title} title={row.title} items={row.items} />
        ))}
      </div>
    </>
  );
}
