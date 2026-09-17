import { RefreshCw } from "lucide-react";

export const CATALOG_QUERY_OPTIONS = {
  retry: 4,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  refetchInterval: (query: { state: { data: unknown } }) =>
    query.state.data ? 5 * 60 * 1000 : 8_000,
};

export function CatalogStatus({
  label,
  isError,
  isFetching,
  onRefresh,
}: {
  label: string;
  isError: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 px-6 pt-20 text-center">
      <p className="text-muted-foreground">
        {isError ? "Couldn't load titles. Check your connection and try again." : `Loading ${label}…`}
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70"
      >
        <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        {isFetching ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
}
