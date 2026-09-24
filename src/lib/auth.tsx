import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, PLANS, ADMIN_EMAIL, type PlanId, type UserStatus } from "./supabase";
import { checkRenewal, isSubscriptionLapsed } from "./admin";
import { isAuthLocked } from "./auth-lock";
import { startAdminAlerts, stopAdminAlerts } from "./admin-alerts";
import { claimScreenSlot, pingScreenSlot, releaseScreenSlot, screenLimitMessage } from "./screens";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  country: string;
  plan: PlanId;
  status: UserStatus;
  subscription_expires_at: string | null;
  pending_plan?: string | null;
  role?: string | null;
  _maxScreens?: boolean;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  isAdmin: boolean;
  isAgent: boolean;
  signUp: (args: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
    country: string;
    plan: PlanId;
  }) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  changePlan: (plan: PlanId) => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ALLOWED_COUNTRY = "Trinidad & Tobago";
const SESSION_BACKUP_KEY = "ttflix_session_backup";

function saveSessionBackup(sess: Session | null) {
  try {
    if (!sess?.access_token || !sess.refresh_token) return;
    localStorage.setItem(
      SESSION_BACKUP_KEY,
      JSON.stringify({ access_token: sess.access_token, refresh_token: sess.refresh_token }),
    );
  } catch { /* ignore */ }
}

function readSessionBackup(): { access_token: string; refresh_token: string } | null {
  try {
    const raw = localStorage.getItem(SESSION_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { access_token?: string; refresh_token?: string };
    if (!parsed.access_token || !parsed.refresh_token) return null;
    return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
  } catch {
    return null;
  }
}

function clearSessionBackup() {
  try { localStorage.removeItem(SESSION_BACKUP_KEY); } catch { /* ignore */ }
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile) ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(true);

  const userRef = useRef(user);
  userRef.current = user;
  const signingOutRef = useRef(false);
  const recoveringRef = useRef(false);
  const screenIdRef = useRef<string | null>(null);
  const [screensBlocked, setScreensBlocked] = useState(false);

  const refreshProfile = useCallback(async () => {
    if (!userRef.current) return;
    const p = await loadProfile(userRef.current.id);
    setProfile(p);
  }, []);

  // 1. Restore session on mount and keep the JWT alive after Android sleeps.
  useEffect(() => {
    const dropSession = () => {
      setSession(null);
      setUser(null);
      setProfile(null);
      setProfileLoading(false);
      setScreensBlocked(false);
    };

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session) saveSessionBackup(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      if (isAuthLocked()) return;
      if (sess) {
        recoveringRef.current = false;
        saveSessionBackup(sess);
      }
      if (!sess && event === "SIGNED_OUT" && !signingOutRef.current) {
        if (recoveringRef.current) {
          recoveringRef.current = false;
          clearSessionBackup();
          dropSession();
          return;
        }
        const backup = readSessionBackup();
        if (!backup) {
          dropSession();
          return;
        }
        // A failed refresh while the screen was off clears storage but the
        // refresh token is often still valid. Put that session back.
        recoveringRef.current = true;
        void supabase.auth.setSession(backup).then(({ data, error }) => {
          if (!error && data.session) {
            recoveringRef.current = false;
            saveSessionBackup(data.session);
            setSession(data.session);
            setUser(data.session.user);
            return;
          }
          recoveringRef.current = false;
          clearSessionBackup();
          dropSession();
        });
        return;
      }
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess) dropSession();
    });

    let resumeTimer = 0;
    const onForeground = () => {
      window.clearTimeout(resumeTimer);
      // visibility, focus, and pageshow all fire together on wake.
      // One refresh only — a second call burns the refresh token and signs out.
      resumeTimer = window.setTimeout(() => {
        void supabase.auth.startAutoRefresh();
      }, 300);
    };
    const onBackground = () => {
      window.clearTimeout(resumeTimer);
      supabase.auth.stopAutoRefresh();
    };
    const onVis = () => {
      if (document.visibilityState === "visible") onForeground();
      else onBackground();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onForeground);
    window.addEventListener("online", onForeground);
    window.addEventListener("pageshow", onForeground);
    window.addEventListener("androidresume", onForeground);

    return () => {
      window.clearTimeout(resumeTimer);
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onForeground);
      window.removeEventListener("online", onForeground);
      window.removeEventListener("pageshow", onForeground);
      window.removeEventListener("androidresume", onForeground);
    };
  }, []);

  // 2. Load profile whenever user changes
  useEffect(() => {
    if (user) {
      setProfileLoading(true);
      loadProfile(user.id).then(async () => {
        const isAdminUser = (user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
        await checkRenewal(user.id, isAdminUser);
        const fresh = await loadProfile(user.id);
        setProfile(fresh);
        setProfileLoading(false);
      });
    } else {
      setProfile(null);
      setProfileLoading(false);
    }
  }, [user]);

  // 3. Realtime profile sync
  useEffect(() => {
    if (!user || !session) return;

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `id=eq.${user.id}`,
        },
        async () => {
          const updated = await loadProfile(user.id);
          setProfile(updated);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, session]);

  // Re-check expiry when the app comes back to the foreground (midnight cutoff).
  useEffect(() => {
    if (!user) return;
    const run = () => {
      const isAdminUser = (user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
      checkRenewal(user.id, isAdminUser).then(() => refreshProfile());
    };
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user, refreshProfile]);

  const signUp: AuthContextValue["signUp"] = async ({
    email, password, fullName, phone, country, plan,
  }) => {
    if (country !== ALLOWED_COUNTRY) {
      throw new Error("TTFlix is only available in Trinidad & Tobago.");
    }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, phone, country, plan },
      },
    });
    if (error) throw error;
    const newUser = data.user;
    if (newUser) {
      await supabase.from("profiles").upsert({
        id: newUser.id, email, full_name: fullName, phone, country, plan, status: "pending",
      });
    }
  };

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const signedIn = data.user;
    const signedInSession = data.session;
    if (!signedIn || !signedInSession) throw new Error("Sign in failed");

    // ── Geo-check — verify user is in Trinidad & Tobago by real IP ──────────
    // Skip for admin and agents so they can manage from anywhere
    const isAdminEmail = (signedIn.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const profileForGeo = await loadProfile(signedIn.id);
    const isAgentRole = profileForGeo?.role === "agent";
    if (!isAdminEmail && !isAgentRole) {
      try {
        const geoRes = await supabase.functions.invoke("geo-check", { method: "POST" });
        const geoData = geoRes.data as { allowed: boolean; reason?: string } | null;
        if (geoData && !geoData.allowed) {
          signingOutRef.current = true;
          clearSessionBackup();
          await supabase.auth.signOut();
          signingOutRef.current = false;
          throw new Error(geoData.reason ?? "TTFlix is only available in Trinidad & Tobago.");
        }
      } catch (geoErr: any) {
        // If geo-check itself throws (network error), don't block — fail open
        if (geoErr?.message?.includes("Trinidad")) throw geoErr;
        console.warn("[geo-check] skipped:", geoErr?.message);
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    let prof = await loadProfile(signedIn.id);
    if (!prof) {
      const meta = signedIn.user_metadata ?? {};
      await supabase.from("profiles").upsert({
        id: signedIn.id,
        email: signedIn.email,
        full_name: meta.full_name ?? null,
        country: meta.country ?? ALLOWED_COUNTRY,
        plan: (meta.plan as PlanId) ?? "basic",
        status: "pending",
      });
      prof = await loadProfile(signedIn.id);
    }

    if (prof && prof.country !== ALLOWED_COUNTRY) {
      signingOutRef.current = true;
      clearSessionBackup();
      await supabase.auth.signOut();
      signingOutRef.current = false;
      throw new Error("TTFlix is only available in Trinidad & Tobago.");
    }

    // Auto-suspend approved accounts whose subscription has expired.
    if (
      prof &&
      prof.status === "approved" &&
      isSubscriptionLapsed(prof.subscription_expires_at) &&
      prof.role !== "agent"
    ) {
      await supabase.from("profiles").update({ status: "suspended" }).eq("id", prof.id);
      prof = await loadProfile(signedIn.id);
    }

    const isAdminEmailCheck = signedIn.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    if (!isAdminEmailCheck) {
      const slot = await claimScreenSlot({ userId: signedIn.id, plan: prof?.plan });
      if (!slot.ok) {
        if (slot.reason === "limit") {
          signingOutRef.current = true;
          clearSessionBackup();
          await supabase.auth.signOut();
          signingOutRef.current = false;
          throw new Error(screenLimitMessage(prof?.plan, slot.max));
        }
        throw new Error("Could not start your session. Check your connection and try again.");
      }
    }
    setProfile(prof);
  };

  const signOut: AuthContextValue["signOut"] = async () => {
    signingOutRef.current = true;
    clearSessionBackup();
    try {
      stopAdminAlerts();
      if (userRef.current) {
        try { await releaseScreenSlot(userRef.current.id); } catch { /* ignore */ }
      }
      await supabase.auth.signOut();
      setProfile(null);
      setScreensBlocked(false);
      screenIdRef.current = null;
      localStorage.removeItem("ttflix_active_profile");
    } finally {
      signingOutRef.current = false;
    }
  };

  const changePlan: AuthContextValue["changePlan"] = async (plan) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ plan }).eq("id", user.id);
    if (error) throw error;
    await refreshProfile();
  };

  // Admin is determined solely by the Supabase Auth email (user.email),
  // which only Supabase Auth controls. We do NOT check profile.email because
  // the profiles table is a DB row that could have incorrect data, allowing
  // regular users to pass the admin check if their profile email matched.
  const isAdmin = (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const isAgent = !isAdmin && (profile?.role === "agent");

  useEffect(() => {
    if (!user || !session || !profile || isAdmin) return;
    let stopped = false;

    const claim = async () => {
      if (isAuthLocked()) return;
      const slot = await claimScreenSlot({ userId: user.id, plan: profile.plan });
      if (stopped) return;
      if (!slot.ok) {
        // Stay logged in. Only block playback if other devices took every screen.
        if (slot.reason === "limit") setScreensBlocked(true);
        return;
      }
      screenIdRef.current = slot.id;
      setScreensBlocked(false);
    };

    void claim();
    const t = window.setInterval(() => {
      if (isAuthLocked()) return;
      if (screenIdRef.current) {
        pingScreenSlot(screenIdRef.current).catch(() => {});
      } else {
        void claim();
      }
    }, 15_000);
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (screenIdRef.current) {
        pingScreenSlot(screenIdRef.current).catch(() => {});
      } else {
        void claim();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stopped = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id, profile?.plan, isAdmin, !!session]);

  useEffect(() => {
    if (isAdmin && session?.access_token) startAdminAlerts();
    else stopAdminAlerts();
  }, [isAdmin, session?.access_token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile: profile ? { ...profile, _maxScreens: screensBlocked } : null,
        loading,
        profileLoading,
        isAdmin,
        isAgent,
        signUp,
        signIn,
        signOut,
        changePlan,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
