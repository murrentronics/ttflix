/**
 * nightly-renewal Edge Function
 *
 * Automatically suspends any approved account whose subscription_expires_at
 * has passed. Called nightly via pg_cron — no user sign-in required.
 *
 * Deploy: push to main (GitHub Action handles it), or manually:
 *   npx supabase functions deploy nightly-renewal --project-ref pqjnkazkkagmewbaylti
 *
 * Schedule: run supabase/cron-setup.sql ONCE in the Supabase SQL editor.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically
 * by Supabase into every Edge Function — no manual secrets needed.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Accept calls from pg_cron (x-ttflix-cron header) or a Bearer service-role token
  const cronHeader = req.headers.get("x-ttflix-cron");
  const authHeader = req.headers.get("Authorization");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const isAuthorized =
    cronHeader === "true" ||
    (serviceKey.length > 0 && authHeader === `Bearer ${serviceKey}`);

  if (!isAuthorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";

  // Service role bypasses RLS so we can update any profile row
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("profiles")
    .update({ status: "suspended" })
    .eq("status", "approved")
    .lt("subscription_expires_at", now)
    .select("id, email, subscription_expires_at");

  if (error) {
    console.error("[nightly-renewal] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const count = data?.length ?? 0;
  console.log(`[nightly-renewal] Suspended ${count} account(s) at ${now}`);
  if (count > 0) {
    console.log("[nightly-renewal] Emails:", data?.map((r) => r.email).join(", "));
  }

  return new Response(
    JSON.stringify({ suspended: count, timestamp: now }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
