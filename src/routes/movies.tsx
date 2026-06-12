import { createFileRoute } from "@tanstack/react-router";
import { CategoryView } from "@/components/CategoryView";

export const Route = createFileRoute("/movies")({
  head: () => ({
    meta: [
      { title: "Movies — TTFlix" },
      { name: "description", content: "Browse popular, trending and top-rated movies on TTFlix." },
    ],
  }),
  component: () => <CategoryView category="movies" heading="Movies" />,
});
