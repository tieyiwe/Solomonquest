import { supabase } from "@/lib/supabase";

/** user_metadata key Register stores the chosen school under, so a join
 *  survives the email-confirmation round trip (signUp returns no session
 *  then, and the URL's ?schoolId is gone by the time they log in). */
export const PENDING_SCHOOL_KEY = "pending_school_id";

/** PUT /users/me/join-school — makes the signed-in, school-less user a
 *  student of `schoolId`. Resolves to an error message, or null on success. */
export async function joinSchool(schoolId: string, accessToken?: string): Promise<string | null> {
  const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch("/api/users/me/join-school", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ schoolId }),
  });
  if (res.ok) {
    // Clear the pending marker so it's never re-applied.
    await supabase.auth.updateUser({ data: { [PENDING_SCHOOL_KEY]: null } }).catch(() => {});
    return null;
  }
  const body = await res.json().catch(() => ({}));
  return (body as { error?: string }).error ?? `Could not join the school (${res.status})`;
}

/** user_metadata key for an invitation accepted at sign-up time when email
 *  confirmation meant there was no session yet to accept it with. */
export const PENDING_INVITE_KEY = "pending_invite_token";

/** POST /invitations/accept/:token as the signed-in user. Resolves to
 *  { role } on success or { error }. */
export async function acceptInvite(
  token: string,
  accessToken?: string
): Promise<{ role: string } | { error: string }> {
  const bearer = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token;
  const res = await fetch(`/api/invitations/accept/${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string; role?: string };
  if (!res.ok) return { error: body.error ?? `Failed to accept invitation (${res.status})` };
  await supabase.auth.updateUser({ data: { [PENDING_INVITE_KEY]: null } }).catch(() => {});
  return { role: body.role ?? "student" };
}
