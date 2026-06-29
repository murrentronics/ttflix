import { createClient } from "@supabase/supabase-js";

// External Supabase project (not Lovable Cloud).
const SUPABASE_URL = "https://pqjnkazkkagmewbaylti.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxam5rYXpra2FnbWV3YmF5bHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTA4NDYsImV4cCI6MjA5Njg2Njg0Nn0.UbqZYCfgZ8K2cOPCdPKLEUc6gi33GcvVuL1FAB0y95g";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
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
