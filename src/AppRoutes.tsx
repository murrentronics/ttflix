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
import { BillingPage } from "./pages/BillingPage";
import { WatchPage } from "./pages/WatchPage";
import { ProfilePickerPage } from "./pages/ProfilePickerPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { useAuth } from "./lib/auth";

export function AppRoutes() {
  const { loading, profileLoading } = useAuth();

  // While auth is still resolving show a plain black screen — the native
  // SplashActivity already played the branded intro so no second loader needed.
  if (loading || profileLoading) {
    return <div className="fixed inset-0 bg-black" />;
  }

  return (
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
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/watch/:mediaType/:id" element={<WatchPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
    </Routes>
  );
}
