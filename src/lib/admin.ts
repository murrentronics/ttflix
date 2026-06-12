import { supabase, type UserStatus } from "./supabase";
import type { Profile } from "./auth";

export type AdminUser = Profile & {
  status: UserStatus;
  subscription_expires_at: string | null;
};

export async function fetchUsersByStatus(status: UserStatus): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("status", status)
    .order("email", { ascending: true });
  if (error) throw error;
  return (data as AdminUser[]) ?? [];
}

export async function countByStatus(status: UserStatus): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  return count ?? 0;
}

export async function setUserStatus(id: string, status: UserStatus) {
  const patch: Record<string, unknown> = { status };
  // Approving grants a 30-day subscription window.
  if (status === "approved") {
    patch.subscription_expires_at = new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
  }
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteUserRecord(id: string) {
  const { error } = await supabase.from("profiles").delete().eq("id", id);
  if (error) throw error;
}

export type BankDetails = {
  bank_name: string | null;
  account_name: string | null;
  account_number: string | null;
  account_type: string | null;
  branch: string | null;
  instructions: string | null;
};

export const EMPTY_BANK: BankDetails = {
  bank_name: "",
  account_name: "",
  account_number: "",
  account_type: "",
  branch: "",
  instructions: "",
};

export async function getBankDetails(): Promise<BankDetails | null> {
  const { data } = await supabase
    .from("bank_details")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  return (data as BankDetails) ?? null;
}

export async function saveBankDetails(details: BankDetails) {
  const { error } = await supabase
    .from("bank_details")
    .upsert({ id: 1, ...details, updated_at: new Date().toISOString() });
  if (error) throw error;
}
