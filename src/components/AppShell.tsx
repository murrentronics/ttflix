import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Navbar } from "./Navbar";
import { useProfile } from "@/lib/ProfileContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { activeProfile } = useProfile();
  const { pathname } = useLocation();
  const isKids = activeProfile?.is_kids ?? false;

  // No footer on admin/agent panels — they have their own sidebar nav
  const hideFooter = pathname.startsWith("/admin") || pathname.startsWith("/agent");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex-1">{children}</main>
      {!hideFooter && (
        <footer className="border-t border-border px-4 py-10 text-sm text-muted-foreground sm:px-8">
          <div className="mx-auto max-w-6xl space-y-4 text-center">
            <Link to="/" className="block text-xl font-extrabold text-primary">
              TT<span className="text-foreground">FLIX</span>
            </Link>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 justify-items-center">
              <Link to="/movies" className="hover:text-foreground">Movies</Link>
              <Link to="/tv" className="hover:text-foreground">TV Shows</Link>
              {isKids && <Link to="/cartoons" className="hover:text-foreground">Cartoons</Link>}
              <Link to="/account" className="hover:text-foreground">Account</Link>
              {!isKids && (
                <Link to="/search" className="hover:text-foreground">Search</Link>
              )}
            </div>
            <p className="text-xs">
              © {new Date().getFullYear()} TTFlix. Available in Trinidad & Tobago.
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
