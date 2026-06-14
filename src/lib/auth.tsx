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
  _maxScreens?: boolean;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  profileLoading: boolean;
  isAdmin: boolean;
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

/**
 * Register a screen slot keyed on the Supabase session access_token.
 *
 * Why session token instead of a localStorage device ID:
 * - localStorage is wiped when the app is deleted/reinstalled, leaving a ghost
 *   row in `screens` that blocks the next login attempt.
 * - The access_token is server-issued on every fresh sign-in and is completely
 *   independent of local storage. Deleted apps can never heartbeat, so their
 *   rows expire after 2 hours automatically.
 */
async function registerScreen(userId: string, sessionId: string, plan: PlanId) {
  // 1. Delete any existing row for this exact session (handles app restart).
  await supabase
    .from("screens")
    .delete()
    .eq("user_id", userId)
    .eq("session_id", sessionId);

  // 2. Purge rows that haven't heartbeated in > 2 hours (deleted/crashed apps).
  const staleDate = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("screens")
    .delete()
    .eq("user_id", userId)
    .lt("last_active", staleDate);

  // 3. Count truly active sessions after purge.
  const { count } = await supabase
    .from("screens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const max = PLANS[plan]?.screens ?? 2;
  if ((count ?? 0) >= max) {
    throw new Error(
      `Screen limit reached (${max} screen${max === 1 ? "" : "s"} on ${plan} plan). Sign out of another device to continue.`
    );
  }

  // 4. Insert fresh row for this session.
  await supabase.from("screens").insert({
    user_id: userId,
    session_id: sessionId,
    last_active: new Date().toISOString(),
  });
}

async function removeScreen(userId: string, sessionId: string) {
  await supabase
    .from("screens")
    .delete()
    .eq("user_id", userId)
    .eq("session_id", sessionId);
}

async function heartbeatScreen(userId: string, sessionId: string) {
  await supabase
    .from("screens")
    .update({ last_active: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("session_id", sessionId);
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

  // 3. Realtime profile sync + heartbeat
  useEffect(() => {
    if (!user || !session) return;

    const isAdminUser = (user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Heartbeat every 30 min — keeps this session's row alive.
    // If the app is deleted, this never fires and the row expires after 2 hours.
    const heartbeat = setInterval(() => {
      if (!isAdminUser) heartbeatScreen(user.id, session.access_token);
    }, 30 * 60 * 1000);

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
      clearInterval(heartbeat);
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
      new Date(prof.subscription_expires_at).getTime() < Date.now()
    ) {
      await supabase.from("profiles").update({ status: "suspended" }).eq("id", prof.id);
      prof = await loadProfile(signedIn.id);
    }

    try {
      const isAdminEmail = signedIn.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (!isAdminEmail) {
        // Use the server-issued access_token as the session identifier —
        // completely independent of localStorage so deleted apps leave no ghost rows.
        await registerScreen(signedIn.id, signedInSession.access_token, prof?.plan ?? "basic");
      }
    } catch (e: any) {
      await supabase.auth.signOut();
      throw new Error(e?.message ?? "Max screens already in use. Sign out of another device first.");
    }
    setProfile(prof);
  };

  const signOut: AuthContextValue["signOut"] = async () => {
    if (user && session) {
      const isAdminUser = (user.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
      if (!isAdminUser) await removeScreen(user.id, session.access_token);
    }
    await supabase.auth.signOut();
    setProfile(null);
  };

  const changePlan: AuthContextValue["changePlan"] = async (plan) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ plan }).eq("id", user.id);
    if (error) throw error;

    const newMax = PLANS[plan]?.screens ?? 2;
    const { data: allScreens } = await supabase
      .from("screens")
      .select("id, last_active")
      .eq("user_id", user.id)
      .order("last_active", { ascending: false });

    if (allScreens && allScreens.length > newMax) {
      const currentSessionId = session?.access_token;
      const { data: currentRow } = currentSessionId
        ? await supabase
            .from("screens")
            .select("id")
            .eq("user_id", user.id)
            .eq("session_id", currentSessionId)
            .maybeSingle()
        : { data: null };

      const toKeep = new Set(allScreens.slice(0, newMax).map((s) => s.id));
      if (currentRow) toKeep.add(currentRow.id);
      const toDelete = allScreens.filter((s) => !toKeep.has(s.id)).map((s) => s.id);
      if (toDelete.length > 0) {
        await supabase.from("screens").delete().in("id", toDelete);
      }
    }

    await refreshProfile();
  };

  const isAdmin =
    (user?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase() ||
    (profile?.email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        profileLoading,
        isAdmin,
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
