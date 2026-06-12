import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon } from "lucide-react";
import { searchContent } from "@/lib/tmdb.functions";
import { AppShell } from "@/components/AppShell";
import { MovieCard } from "@/components/MovieCard";

export const Route = createFileRoute("/search")({
  head: () => ({ meta: [{ title: "Search — TTFlix" }] }),
  component: SearchPage,
});

function SearchPage() {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 400);
    return () => clearTimeout(t);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchContent({ data: { query } }),
    enabled: query.length > 1,
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-24 sm:px-8">
        <div className="relative mb-8">
          <SearchIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search movies, TV shows, cartoons…"
            className="w-full rounded-md border border-border bg-input py-3 pl-12 pr-4 text-lg outline-none focus:border-primary"
          />
        </div>

        {query.length <= 1 && (
          <p className="text-muted-foreground">Type at least 2 characters to search.</p>
        )}
        {isFetching && <p className="text-muted-foreground">Searching…</p>}
        {data && data.results.length === 0 && query.length > 1 && !isFetching && (
          <p className="text-muted-foreground">No results for “{query}”.</p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {data?.results.map((item) => (
            <div key={`${item.media_type}-${item.id}`} className="flex justify-center">
              <MovieCard item={item} />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
