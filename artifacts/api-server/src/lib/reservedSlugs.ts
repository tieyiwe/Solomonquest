/**
 * Top-level path segments the frontend uses for its own pages. Schools are
 * served at /<slug>, so a school may not take one of these as its slug.
 * Keep in sync with RESERVED_ROOT_SEGMENTS in solomonquest/src/Router.tsx.
 */
export const RESERVED_SLUGS = new Set([
  "api", "auth", "login", "logout", "register", "signup", "onboarding",
  "schools", "dashboard", "admin", "super_admin", "teacher", "student", "parent",
  "chat", "forum", "invite", "messages", "calendar", "settings", "notifications",
  "profile", "transcript", "transcripts", "help", "assets", "static",
  "verify", "certificates", "reports",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.trim().toLowerCase());
}
