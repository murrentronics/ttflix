import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./lib/auth";
import { ProfileProvider } from "./lib/ProfileContext";
import { DetailProvider } from "./components/DetailContext";
import { DetailModal } from "./components/DetailModal";
import { AppRoutes } from "./AppRoutes";
import { ScrollToTop } from "./components/ScrollToTop";
import { UpdateChecker } from "./components/UpdateChecker";
import "./styles.css";

function bindAndroidKeyboard() {
  const bridge = () => (window as any).AndroidKeyboard;
  let closeTimer = 0;
  const isField = (el: EventTarget | Element | null) => {
    const t = el as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
  };
  document.addEventListener("focusin", (e) => {
    if (!isField(e.target)) return;
    window.clearTimeout(closeTimer);
    bridge()?.open?.();
  });
  document.addEventListener("focusout", () => {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (isField(document.activeElement)) return;
      bridge()?.close?.();
    }, 200);
  });
  // Coming back from the player must not leave the keyboard open behind the app.
  window.addEventListener("androidresume", () => {
    window.clearTimeout(closeTimer);
    const active = document.activeElement as HTMLElement | null;
    if (isField(active)) active.blur();
    bridge()?.close?.();
  });
}
bindAndroidKeyboard();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <AuthProvider>
          <ProfileProvider>
            <DetailProvider>
              <AppRoutes />
              <ScrollToTop />
              <DetailModal />
              <UpdateChecker />
            </DetailProvider>
          </ProfileProvider>
        </AuthProvider>
      </HashRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
