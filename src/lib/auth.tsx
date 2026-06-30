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
import { checkRenewal } from "./admin";

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
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refreshProfile = useCallback(async () => {
    if (!userRef.current) return;
    const p = await loadProfile(userRef.current.id);
    setProfile(p);
  }, []);

  // 1. Restore session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (!sess) {
        setProfile(null);
        setProfileLoading(false);
      }
    });
    return () => sub.subscription.unsubscribe();
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
          await supabase.auth.signOut();
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
      await supabase.auth.signOut();
      throw new Error("TTFlix is only available in Trinidad & Tobago.");
    }

    // Auto-suspend approved accounts whose subscription has expired.
    if (
      prof &&
      prof.status === "approved" &&
      prof.subscription_expires_at &&
      new Date(prof.subscription_expires_at).getTime() < Date.now() &&
      prof.role !== "agent"
    ) {
      await supabase.from("profiles").update({ status: "suspended" }).eq("id", prof.id);
      prof = await loadProfile(signedIn.id);
    }

    try {
      const isAdminEmailCheck = signedIn.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (!isAdminEmailCheck) {
        // Screen limit is enforced in WatchPage via active_watches table
      }
    } catch (e: any) {
      await supabase.auth.signOut();
      throw new Error(e?.message ?? "Max screens already in use. Sign out of another device first.");
    }
    setProfile(prof);

    setProfile(prof);
  };

  const signOut: AuthContextValue["signOut"] = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    localStorage.removeItem("ttflix_active_profile");
  };

  const changePlan: AuthContextValue["changePlan"] = async (plan) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ plan }).eq("id", user.id);
    if (error) throw error;
    await refreshProfile();
  };

  const isAdmin =
    (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
    (profile?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

  const isAgent = !isAdmin && (profile?.role === "agent");

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
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
