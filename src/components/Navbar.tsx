import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Search, Menu, X, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useProfile } from "@/lib/ProfileContext";

const ADULT_LINKS = [
  { to: "/", label: "Home" },
  { to: "/movies", label: "Movies" },
  { to: "/tv", label: "TV Shows" },
] as const;

const KIDS_LINKS = [
  { to: "/", label: "Home" },
  { to: "/movies", label: "Movies" },
  { to: "/tv", label: "TV Shows" },
  { to: "/cartoons", label: "Cartoons" },
] as const;

export function Navbar() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const { activeProfile, profiles, setActiveProfile } = useProfile();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isKids = activeProfile?.is_kids ?? false;
  const LINKS = isKids ? KIDS_LINKS : ADULT_LINKS;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // TV remote Back button / keyboard Escape closes any open menu
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "GoBack") {
        setMobileOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const anyMenuOpen = mobileOpen || profileOpen;

  return (
    <>
      {/* Background overlay */}
      <div
        className={`fixed inset-0 z-30 bg-black transition-opacity duration-300 ${
          anyMenuOpen ? "opacity-85 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => { setMobileOpen(false); setProfileOpen(false); }}
        aria-hidden="true"
      />
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
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) =>
                  `rounded px-2 py-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isActive
                      ? "text-foreground font-semibold"
                      : "text-foreground/80 hover:text-foreground"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link to="/search" className="rounded p-1 text-foreground/90 transition hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Search">
            <Search className="h-5 w-5" />
          </Link>

          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => { setMobileOpen(false); setProfileOpen((o) => !o); }}
                className="flex items-center gap-1 rounded text-sm font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Profile menu"
              >
                <span
                  className="flex h-9 w-9 items-center justify-center rounded text-sm font-bold text-white"
                  style={{ backgroundColor: activeProfile?.avatar_color ?? "#E50914" }}
                >
                  {activeProfile?.is_kids ? "👶" : (activeProfile?.name ?? profile?.full_name ?? user.email ?? "U").charAt(0).toUpperCase()}
                </span>
                <ChevronDown className={`h-4 w-4 text-foreground/70 transition-transform ${profileOpen ? "rotate-180" : ""}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-md border border-border bg-popover shadow-xl z-50">
                  {/* Current profile */}
                  {activeProfile && (
                    <div className="border-b border-border px-4 py-2">
                      <p className="text-xs text-muted-foreground">Watching as</p>
                      <p className="text-sm font-semibold">{activeProfile.name}</p>
                    </div>
                  )}

                  {/* Switch to another profile inline */}
                  {profiles.filter((p) => p.id !== activeProfile?.id).length > 0 && (
                    <div className="border-b border-border py-1">
                      <p className="px-4 pt-1 pb-0.5 text-xs text-muted-foreground">Switch profile</p>
                      {profiles
                        .filter((p) => p.id !== activeProfile?.id && p.name !== activeProfile?.name)
                        .map((p) => (
                          <button
                            key={p.id}
                            onClick={() => { setActiveProfile(p); setProfileOpen(false); navigate("/"); }}
                            className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                          >
                            <span
                              className="flex h-7 w-7 items-center justify-center rounded text-xs font-bold text-white shrink-0"
                              style={{ backgroundColor: p.avatar_color }}
                            >
                              {p.is_kids ? "👶" : p.name.charAt(0).toUpperCase()}
                            </span>
                            {p.name}
                          </button>
                        ))}
                    </div>
                  )}

                  <div className="py-1">
                    <Link
                      to="/profiles"
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                    >
                      All Profiles
                    </Link>
                    <Link
                      to="/account"
                      onClick={() => setProfileOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                    >
                      Account
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={() => setProfileOpen(false)}
                        className="block px-4 py-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                      >
                        Admin Panel
                      </Link>
                    )}
                    <button
                      onClick={async () => { setProfileOpen(false); await signOut(); navigate("/"); }}
                      className="block w-full px-4 py-2 text-left text-sm text-destructive hover:bg-accent focus-visible:outline-none focus-visible:bg-accent"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/auth"
              className="rounded bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/85"
            >
              Sign In
            </Link>
          )}

          <div className="relative md:hidden">
            <button onClick={() => { setProfileOpen(false); setMobileOpen((o) => !o); }} aria-label="Menu">
              {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>

            {mobileOpen && (
              <nav className="absolute right-0 top-full mt-1 w-52 rounded-md border border-border bg-popover py-1 shadow-xl z-50">
                {LINKS.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    end={l.to === "/"}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `block px-4 py-2 text-sm hover:bg-accent ${
                        isActive ? "text-foreground font-semibold" : "text-foreground/80"
                      }`
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
