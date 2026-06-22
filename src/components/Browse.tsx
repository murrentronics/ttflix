import { useEffect, useRef } from "react";
import { Hero } from "./Hero";
import { MovieRow } from "./MovieRow";
import { ContinueWatchingRow } from "./ContinueWatchingRow";
import type { TmdbItem } from "@/lib/tmdb.functions";

type Feed = {
  hero: TmdbItem[];
  rows: { title: string; items: TmdbItem[] }[];
};

// Titles that should appear right after Continue Watching
const NEW_RELEASES_TITLES = new Set(["New Releases", "New for Kids", "Trending Now"]);

export function Browse({ feed }: { feed: Feed }) {
  const newReleasesRow = feed.rows.find((r) => NEW_RELEASES_TITLES.has(r.title));
  const otherRows = feed.rows.filter((r) => !NEW_RELEASES_TITLES.has(r.title));

  // Auto-focus the first card when the page loads so TV remote users
  // have an immediately highlighted element without pressing anything first
  useEffect(() => {
    const t = setTimeout(() => {
      const first = document.querySelector<HTMLElement>("[data-tv-card]");
      first?.focus();
    }, 300);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <Hero items={feed.hero} />
      <div className="relative z-10 -mt-16 pb-10">
        <ContinueWatchingRow />
        {newReleasesRow && (
          <MovieRow key={newReleasesRow.title} title={newReleasesRow.title} items={newReleasesRow.items} />
        )}
        {otherRows.map((row) => (
          <MovieRow key={row.title} title={row.title} items={row.items} />
        ))}
      </div>
    </>
  );
}
