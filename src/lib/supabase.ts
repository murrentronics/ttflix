import { createClient } from "@supabase/supabase-js";

// External Supabase project (not Lovable Cloud).
// Values come from environment variables — never hardcode secrets in source.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Android WebView's navigator.locks times out while the screen is off, and that
// timeout makes Supabase drop the session. Queue auth work in memory instead.
let authLockTail: Promise<void> = Promise.resolve();

async function authLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const prev = authLockTail;
  let release: () => void = () => {};
  authLockTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    lock: authLock,
  },
});

export const ADMIN_EMAIL = "kellymarshall2026@gmail.com";

export type UserStatus = "pending" | "approved" | "suspended" | "expelled";

export const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  suspended: "Suspended",
  expelled: "Expelled",
};

export type PlanId = "basic" | "premium" | "basic_annual" | "premium_annual";

export const PLANS: Record<
  PlanId,
  { id: PlanId; name: string; price: number; screens: number; quality: string; annual?: boolean }
> = {
  basic:           { id: "basic",           name: "Standard",         price: 60,  screens: 2, quality: "Up to Ultra HD (4K) + HDR", annual: false },
  premium:         { id: "premium",         name: "Premium",          price: 125, screens: 5, quality: "Up to Ultra HD (4K) + HDR", annual: false },
  basic_annual:    { id: "basic_annual",    name: "Standard Annual",  price: 550, screens: 2, quality: "Up to Ultra HD (4K) + HDR", annual: true  },
  premium_annual:  { id: "premium_annual",  name: "Premium Annual",   price: 750, screens: 5, quality: "Up to Ultra HD (4K) + HDR", annual: true  },
};
