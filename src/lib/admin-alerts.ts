import { supabase, ADMIN_EMAIL } from "./supabase";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function nativeNotify() {
  return (window as any).AndroidNotify;
}

function isAdminSession(email?: string | null) {
  return (email ?? "").toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

function startNative(attempt = 0) {
  try {
    const bridge = nativeNotify();
    if (!bridge || typeof bridge.start !== "function") {
      if (attempt < 20) setTimeout(() => startNative(attempt + 1), 500);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      if (!s?.access_token || !isAdminSession(s.user?.email)) return;
      bridge.start(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        s.access_token,
        s.refresh_token ?? "",
      );
    }).catch(() => {});
  } catch { /* ignore */ }
}

let requestChannel: ReturnType<typeof supabase.channel> | null = null;

function nudgeNative() {
  try {
    nativeNotify()?.pollNow?.();
  } catch { /* ignore */ }
}

function watchPendingRequests() {
  if (requestChannel) return;
  supabase.auth.getSession().then(({ data }) => {
    if (!isAdminSession(data.session?.user?.email)) return;
    if (requestChannel) return;
    requestChannel = supabase
      .channel("admin-alert-push")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "agent_billing_requests" },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row?.status === "pending_admin") nudgeNative();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agent_billing_requests" },
        (payload) => {
          const row = payload.new as { status?: string };
          if (row?.status === "pending_admin") nudgeNative();
        },
      )
      .subscribe();
  }).catch(() => {});
}

/** Start native polling so the admin phone alerts even with the screen off. */
export function startAdminAlerts() {
  startNative(0);
  watchPendingRequests();
}

export function stopAdminAlerts() {
  try {
    nativeNotify()?.stop?.();
  } catch { /* ignore */ }
  if (requestChannel) {
    supabase.removeChannel(requestChannel);
    requestChannel = null;
  }
}
