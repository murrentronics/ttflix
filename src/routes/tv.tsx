import { createFileRoute } from "@tanstack/react-router";
import { CategoryView } from "@/components/CategoryView";

export const Route = createFileRoute("/tv")({
  head: () => ({
    meta: [
      { title: "TV Shows — TTFlix" },
      { name: "description", content: "Stream popular and top-rated TV series on TTFlix." },
    ],
  }),
  component: () => <CategoryView category="tv" heading="TV Shows" />,
});
