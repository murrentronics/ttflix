import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Menu, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/movies", label: "Movies" },
  { to: "/tv", label: "TV Shows" },
  { to: "/cartoons", label: "Cartoons" },
  { to: "/my-list", label: "My List" },
] as const;

export function Navbar() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-300 ${
        scrolled ? "bg-background/95 backdrop-blur" : "bg-gradient-to-b from-black/80 to-transparent"
      }`}
    >
      <div className="flex items-center justify-between px-4 py-3 sm:px-8">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-2xl font-extrabold tracking-tight text-primary">
            TT<span className="text-foreground">FLIX</span>
          </Link>
          <nav className="hidden gap-5 text-sm md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-foreground/80 transition hover:text-foreground"
                activeProps={{ className: "text-foreground font-semibold" }}
                activeOptions={{ exact: l.to === "/" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/search" className="text-foreground/90 transition hover:text-primary" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>

          {user ? (
            <div className="group relative">
              <button className="flex h-8 w-8 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
                {(profile?.full_name ?? user.email ?? "U").charAt(0).toUpperCase()}
              </button>
              <div className="invisible absolute right-0 top-full w-44 rounded-md border border-border bg-popover py-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
                <Link to="/account" className="block px-4 py-2 text-sm hover:bg-accent">
                  Account
                </Link>
                <Link to="/my-list" className="block px-4 py-2 text-sm hover:bg-accent">
                  My List
                </Link>
                {isAdmin && (
                  <Link to="/admin" className="block px-4 py-2 text-sm font-semibold text-primary hover:bg-accent">
                    Admin Panel
                  </Link>
                )}
                <button
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/" });
                  }}
                  className="block w-full px-4 py-2 text-left text-sm text-primary hover:bg-accent"
                >
                  Sign Out
                </button>
              </div>
            </div>
          ) : (
            <Link
              to="/auth"
              className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85"
            >
              Sign In
            </Link>
          )}

          <button className="md:hidden" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-border bg-background/98 px-4 py-3 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMobileOpen(false)}
              className="rounded px-2 py-2 text-sm text-foreground/80 hover:bg-accent"
              activeProps={{ className: "text-foreground font-semibold" }}
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
