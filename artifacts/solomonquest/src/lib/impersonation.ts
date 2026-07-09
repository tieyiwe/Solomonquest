import { supabase } from "./supabase";

const ADMIN_SESSION_KEY = "sq_impersonation_admin_session";
const TARGET_KEY = "sq_impersonation_target";

export interface ImpersonationTarget {
  id: string;
  name: string;
  role: string;
}

function dashboardPathFor(role: string): string {
  if (role === "teacher") return "/dashboard/teacher";
  return "/dashboard/student"; // staff and student share the student dashboard
}

/**
 * Starts a "view as" session: mints a real Supabase session for the target
 * user (via a server-generated magic-link OTP, redeemed here) so every
 * existing fetch/query in the app works unmodified once the client swaps to
 * it — no per-page auth plumbing needed. The admin's own session is saved
 * first so `returnToAdmin` can restore it later.
 */
export async function startImpersonation(userId: string): Promise<void> {
  const { data: { session: adminSession } } = await supabase.auth.getSession();
  if (!adminSession) throw new Error("Not signed in");

  const res = await fetch(`/api/admin/impersonate/${userId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${adminSession.access_token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to start view-as session");
  }

  const { emailOtp, targetUser } = await res.json();

  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: emailOtp,
  });
  if (verifyError) throw verifyError;

  sessionStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      access_token: adminSession.access_token,
      refresh_token: adminSession.refresh_token,
    })
  );
  sessionStorage.setItem(TARGET_KEY, JSON.stringify(targetUser as ImpersonationTarget));

  window.location.href = dashboardPathFor(targetUser.role);
}

export function getImpersonationTarget(): ImpersonationTarget | null {
  const raw = sessionStorage.getItem(TARGET_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ImpersonationTarget;
  } catch {
    return null;
  }
}

/** Restores the admin's own session and clears view-as state. */
export async function returnToAdmin(): Promise<void> {
  const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  sessionStorage.removeItem(TARGET_KEY);

  if (!raw) {
    window.location.href = "/dashboard/admin";
    return;
  }

  const { access_token, refresh_token } = JSON.parse(raw);
  await supabase.auth.setSession({ access_token, refresh_token });
  window.location.href = "/dashboard/admin";
}
