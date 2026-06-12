import { createFileRoute } from "@tanstack/react-router";
import { CategoryView } from "@/components/CategoryView";

export const Route = createFileRoute("/cartoons")({
  head: () => ({
    meta: [
      { title: "Cartoons — TTFlix" },
      { name: "description", content: "Animated movies and series for all ages on TTFlix." },
    ],
  }),
  component: () => <CategoryView category="cartoons" heading="Cartoons" />,
});
