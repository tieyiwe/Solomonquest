/**
 * The dashboard root each role lands on. Mirrors the redirect table in
 * ProtectedRoute — parents have their own dashboard and can't open any
 * /dashboard/student/* page, so shared pages must not fall back to the
 * student dashboard for them.
 */
export function dashboardPathForRole(role: string | null | undefined): string {
  if (role === "admin" || role === "super_admin") return "/dashboard/admin";
  if (role === "teacher") return "/dashboard/teacher";
  if (role === "parent") return "/dashboard/parent";
  return "/dashboard/student"; // student + staff share the student dashboard
}
