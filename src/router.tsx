import { QueryClient } from "@tanstack/react-query";
import { createRouter, createHashHistory, createBrowserHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  // Capacitor (Android) serves via file:// — hash history is required.
  // In the browser/SSR build we use the default browser history.
  const isCapacitor =
    typeof window !== "undefined" &&
    (window.location.protocol === "capacitor:" ||
      window.location.protocol === "file:" ||
      import.meta.env.VITE_APP_MODE === "capacitor");

  const history = isCapacitor ? createHashHistory() : createBrowserHistory();

  const router = createRouter({
    routeTree,
    history,
    context: { queryClient },
    scrollRestoration: false,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
