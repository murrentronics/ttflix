import { useEffect, useRef, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { AuthPage } from "./pages/AuthPage";
import { MoviesPage } from "./pages/MoviesPage";
import { TvPage } from "./pages/TvPage";
import { CartoonsPage } from "./pages/CartoonsPage";
import { SearchPage } from "./pages/SearchPage";
import { MyListPage } from "./pages/MyListPage";
import { AccountPage } from "./pages/AccountPage";
import { AdminPage } from "./pages/AdminPage";
import { AgentPage } from "./pages/AgentPage";
import { BillingPage } from "./pages/BillingPage";
import { WatchPage } from "./pages/WatchPage";
import { ProfilePickerPage } from "./pages/ProfilePickerPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { PaymentHistoryPage } from "./pages/PaymentHistoryPage";
import { TTFlixLoader } from "./components/TTFlixLoader";
import { TvRemote } from "./components/TvRemote";

const SPLASH_HOLD_MS = 4000;

function splashStartedAt() {
  const n = Number((window as any).__ttflixSplashAt);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

export function AppRoutes() {
  const [showSplash, setShowSplash] = useState(true);
  const [explode, setExplode] = useState(false);
  const startedAt = useRef(splashStartedAt());

  useEffect(() => {
    document.getElementById("boot-splash")?.remove();
  }, []);

  useEffect(() => {
    if (!showSplash || explode) return;
    const wait = Math.max(0, SPLASH_HOLD_MS - (Date.now() - startedAt.current));
    const t = setTimeout(() => setExplode(true), wait);
    return () => clearTimeout(t);
  }, [showSplash, explode]);

  return (
    <>
      <TvRemote />
      {showSplash && (
        <TTFlixLoader
          explode={explode}
          persistent
          frozen
          onDone={() => setShowSplash(false)}
        />
      )}

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/profiles" element={<ProfilePickerPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/movies" element={<MoviesPage />} />
        <Route path="/tv" element={<TvPage />} />
        <Route path="/cartoons" element={<CartoonsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/my-list" element={<MyListPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/agent" element={<AgentPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/watch/:mediaType/:id" element={<WatchPage />} />
        <Route path="/payment-history" element={<PaymentHistoryPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
    </>
  );
}
