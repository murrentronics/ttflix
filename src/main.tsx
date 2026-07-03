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

// If a next-episode navigation was stored before a reload, apply it now
const pendingNav = sessionStorage.getItem("ttflix_next_ep");
if (pendingNav) {
  sessionStorage.removeItem("ttflix_next_ep");
  window.location.hash = pendingNav;
}

const queryClient = new QueryClient();

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
