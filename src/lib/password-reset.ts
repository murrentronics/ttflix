import { supabase } from "./supabase";

/** Generate a 6-digit numeric code and store it in password_reset_codes */
export async function requestPasswordReset(email: string): Promise<void> {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

  // Delete any existing codes for this email first
  await supabase.from("password_reset_codes").delete().eq("email", email.toLowerCase());

  const { error } = await supabase.from("password_reset_codes").insert({
    email: email.toLowerCase(),
    code,
    expires_at: expiresAt,
    used: false,
  });
  if (error) throw new Error("Failed to create reset code.");

  // Send the code via Supabase's built-in email (custom SMTP)
  // We use resetPasswordForEmail so Supabase sends the email — but we override
  // the flow by also storing our own 6-digit code. The user ignores the link
  // in the Supabase email and comes back to the app to enter the code.
  // For a fully custom email we call our own edge function.
  const { error: emailError } = await supabase.functions.invoke("send-reset-code", {
    body: { email: email.toLowerCase(), code },
  });

  // If edge function doesn't exist yet, fall back silently —
  // the code is still saved in the DB so dev can test without email.
  if (emailError) {
    console.warn("Edge function unavailable, code stored in DB:", code);
  }
}

/** Verify the 6-digit code. Returns the email on success, throws on failure. */
export async function verifyResetCode(email: string, code: string): Promise<string> {
  const { data, error } = await supabase
    .from("password_reset_codes")
    .select("*")
    .eq("email", email.toLowerCase())
    .eq("code", code)
    .eq("used", false)
    .maybeSingle();

  if (error || !data) throw new Error("Invalid or expired code.");

  const expired = new Date(data.expires_at).getTime() < Date.now();
  if (expired) {
    await supabase.from("password_reset_codes").delete().eq("email", email.toLowerCase());
    throw new Error("Code has expired. Please request a new one.");
  }

  return email.toLowerCase();
}

/** Mark code as used and update the password via Supabase Auth admin */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  // Re-verify before applying
  await verifyResetCode(email, code);

  // Sign in with OTP-less approach: use the admin update via service role
  // Since we're on the client, we use signInWithPassword won't work here.
  // Instead we call our edge function which uses the service role to update.
  const { error } = await supabase.functions.invoke("apply-password-reset", {
    body: { email: email.toLowerCase(), code, new_password: newPassword },
  });

  if (error) throw new Error("Failed to update password. Please try again.");

  // Mark code as used
  await supabase
    .from("password_reset_codes")
    .update({ used: true })
    .eq("email", email.toLowerCase())
    .eq("code", code);
}
