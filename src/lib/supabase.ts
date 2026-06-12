import { createClient } from "@supabase/supabase-js";

// External Supabase project (not Lovable Cloud).
const SUPABASE_URL = "https://pqjnkazkkagmewbaylti.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBxam5rYXpra2FnbWV3YmF5bHRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyOTA4NDYsImV4cCI6MjA5Njg2Njg0Nn0.UbqZYCfgZ8K2cOPCdPKLEUc6gi33GcvVuL1FAB0y95g";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
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

export type PlanId = "basic" | "premium";

export const PLANS: Record<
  PlanId,
  { id: PlanId; name: string; price: number; screens: number; quality: string }
> = {
  basic: { id: "basic", name: "Standard", price: 49, screens: 2, quality: "Full HD (1080p)" },
  premium: { id: "premium", name: "Premium", price: 99, screens: 5, quality: "Ultra HD (4K)" },
};
