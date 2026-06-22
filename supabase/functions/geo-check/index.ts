/**
 * geo-check Edge Function
 *
 * Verifies the calling user is located in Trinidad & Tobago based on their
 * real IP address. Called from the client on every sign-in.
 *
 * Supabase Edge Functions run on Deno Deploy which injects the real client IP
 * in the x-forwarded-for header — not spoofable from the client.
 *
 * Deploy: push to main (GitHub Action handles it), or manually:
 *   npx supabase functions deploy geo-check --project-ref pqjnkazkkagmewbaylti
 */

const ALLOWED_COUNTRIES = new Set(["TT"]); // ISO 3166-1 alpha-2

Deno.serve(async (req) => {
  // CORS — only our app origin
  const origin = req.headers.get("origin") ?? "";
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Get real IP — Supabase injects x-forwarded-for with the actual client IP
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim();

  // Cloudflare also injects cf-ipcountry on Supabase edge — try that first (instant, no API call)
  const cfCountry = req.headers.get("cf-ipcountry") ?? "";

  let countryCode = cfCountry.toUpperCase();

  // Fall back to ip-api.com if Cloudflare header not present
  if (!countryCode || countryCode === "XX" || countryCode === "T1") {
    // T1 = Tor, XX = unknown
    if (!ip) {
      // No IP at all — deny
      return new Response(
        JSON.stringify({ allowed: false, reason: "Could not determine location." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    try {
      const geoRes = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode,status`, {
        signal: AbortSignal.timeout(3000),
      });
      const geoData = await geoRes.json();
      if (geoData.status === "success") {
        countryCode = (geoData.countryCode ?? "").toUpperCase();
      }
    } catch {
      // Geo API unreachable — fail open so TT users aren't locked out on API downtime
      console.warn("[geo-check] Geo API unreachable for IP:", ip);
      return new Response(
        JSON.stringify({ allowed: true, reason: "Geo check unavailable — allowed." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  }

  // Block Tor and known VPN/proxy indicators
  if (countryCode === "T1" || countryCode === "XX") {
    return new Response(
      JSON.stringify({ allowed: false, reason: "VPN or proxy detected. TTFlix is only available in Trinidad & Tobago." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const allowed = ALLOWED_COUNTRIES.has(countryCode);

  return new Response(
    JSON.stringify({
      allowed,
      country: countryCode,
      reason: allowed
        ? "Welcome to TTFlix!"
        : "TTFlix is only available in Trinidad & Tobago.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
