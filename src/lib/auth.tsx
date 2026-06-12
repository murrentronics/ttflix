import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, PLANS, type PlanId } from "./supabase";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  country: string;
  plan: PlanId;
};

type AuthContextValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (args: {
    email: string;
    password: string;
    fullName: string;
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

function getDeviceId() {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("ttflix_device_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("ttflix_device_id", id);
  }
  return id;
}

async function loadProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile) ?? null;
}

async function registerScreen(userId: string, plan: PlanId) {
  const deviceId = getDeviceId();
  // existing screen for this device counts as already in use
  const { data: existing } = await supabase
    .from("screens")
    .select("id")
    .eq("user_id", userId)
    .eq("device_id", deviceId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("screens")
      .update({ last_active: new Date().toISOString() })
      .eq("id", existing.id);
    return;
  }

  const { count } = await supabase
    .from("screens")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  const max = PLANS[plan]?.screens ?? 2;
  if ((count ?? 0) >= max) {
    throw new Error("Max screens already in use");
  }

  await supabase.from("screens").insert({
    user_id: userId,
    device_id: deviceId,
    last_active: new Date().toISOString(),
  });
}

async function removeScreen(userId: string) {
  await supabase.from("screens").delete().eq("user_id", userId).eq("device_id", getDeviceId());
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    setProfile(await loadProfile(user.id));
  }, [user]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      loadProfile(user.id).then(setProfile);
    } else {
      setProfile(null);
    }
  }, [user]);

  const signUp: AuthContextValue["signUp"] = async ({
    email,
    password,
    fullName,
    country,
    plan,
  }) => {
    if (country !== ALLOWED_COUNTRY) {
      throw new Error("TTFlix is only available in Trinidad & Tobago.");
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName, country, plan },
      },
    });
    if (error) throw error;

    const newUser = data.user;
    if (newUser) {
      // Upsert profile (works whether or not a DB trigger exists)
      await supabase.from("profiles").upsert({
        id: newUser.id,
        email,
        full_name: fullName,
        country,
        plan,
      });
    }
  };

  const signIn: AuthContextValue["signIn"] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const signedIn = data.user;
    if (!signedIn) throw new Error("Sign in failed");

    let prof = await loadProfile(signedIn.id);
    if (!prof) {
      // create a default profile if missing
      const meta = signedIn.user_metadata ?? {};
      await supabase.from("profiles").upsert({
        id: signedIn.id,
        email: signedIn.email,
        full_name: meta.full_name ?? null,
        country: meta.country ?? ALLOWED_COUNTRY,
        plan: (meta.plan as PlanId) ?? "basic",
      });
      prof = await loadProfile(signedIn.id);
    }

    if (prof && prof.country !== ALLOWED_COUNTRY) {
      await supabase.auth.signOut();
      throw new Error("TTFlix is only available in Trinidad & Tobago.");
    }

    try {
      await registerScreen(signedIn.id, prof?.plan ?? "basic");
    } catch (e) {
      await supabase.auth.signOut();
      throw e;
    }
    setProfile(prof);
  };

  const signOut: AuthContextValue["signOut"] = async () => {
    if (user) await removeScreen(user.id);
    await supabase.auth.signOut();
    setProfile(null);
  };

  const changePlan: AuthContextValue["changePlan"] = async (plan) => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ plan }).eq("id", user.id);
    if (error) throw error;
    await refreshProfile();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, profile, loading, signUp, signIn, signOut, changePlan, refreshProfile }}
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
