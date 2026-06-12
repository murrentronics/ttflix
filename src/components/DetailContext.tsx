import { createContext, useContext, useState, type ReactNode } from "react";
import type { TmdbItem } from "@/lib/tmdb.functions";

type Target = { id: number; mediaType: "movie" | "tv"; title?: string };

type DetailContextValue = {
  open: (item: Target | TmdbItem) => void;
  close: () => void;
  current: Target | null;
};

const DetailContext = createContext<DetailContextValue | null>(null);

export function DetailProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Target | null>(null);

  const open = (item: Target | TmdbItem) => {
    const mediaType = (item as TmdbItem).media_type ?? (item as Target).mediaType;
    setCurrent({ id: item.id, mediaType, title: item.title });
  };

  return (
    <DetailContext.Provider value={{ open, close: () => setCurrent(null), current }}>
      {children}
    </DetailContext.Provider>
  );
}

export function useDetail() {
  const ctx = useContext(DetailContext);
  if (!ctx) throw new Error("useDetail must be used within DetailProvider");
  return ctx;
}
