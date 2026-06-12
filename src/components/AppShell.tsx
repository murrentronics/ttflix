import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Navbar } from "./Navbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>{children}</main>
      <footer className="border-t border-border px-4 py-10 text-sm text-muted-foreground sm:px-8">
        <div className="mx-auto max-w-6xl space-y-4">
          <Link to="/" className="text-xl font-extrabold text-primary">
            TT<span className="text-foreground">FLIX</span>
          </Link>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Link to="/movies" className="hover:text-foreground">Movies</Link>
            <Link to="/tv" className="hover:text-foreground">TV Shows</Link>
            <Link to="/cartoons" className="hover:text-foreground">Cartoons</Link>
            <Link to="/my-list" className="hover:text-foreground">My List</Link>
            <Link to="/account" className="hover:text-foreground">Account</Link>
            <Link to="/search" className="hover:text-foreground">Search</Link>
          </div>
          <p className="text-xs">
            © {new Date().getFullYear()} TTFlix. Available in Trinidad & Tobago. Powered by TMDB &
            Nexstream.
          </p>
        </div>
      </footer>
    </div>
  );
}
