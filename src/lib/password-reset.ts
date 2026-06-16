import { supabase } from "./supabase";

/**
 * Request a password reset OTP via Supabase's built-in email OTP.
 * Supabase sends a 6-digit code to the user's email automatically.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.toLowerCase(),
    options: {
      shouldCreateUser: false, // only send to existing accounts
    },
  });
  if (error) throw new Error("Could not send reset code. Check your email address.");
}

/**
 * Verify the OTP code sent by Supabase and establish a session.
 * Returns the user's email on success.
 */
export async function verifyResetCode(email: string, code: string): Promise<string> {
  const { error } = await supabase.auth.verifyOtp({
    email: email.toLowerCase(),
    token: code,
    type: "email",
  });
  if (error) throw new Error("Invalid or expired code.");
  return email.toLowerCase();
}

/**
 * Update the password. Must be called after verifyResetCode establishes a session.
 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  // verifyOtp already signed them in — just update the password directly
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error("Failed to update password. Please try again.");

  // Sign out after reset so they go through the normal sign-in flow
  await supabase.auth.signOut();
}
