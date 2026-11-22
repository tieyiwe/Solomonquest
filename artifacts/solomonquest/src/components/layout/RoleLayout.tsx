import { ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { ParentLayout } from "@/components/layout/ParentLayout";

/**
 * Wraps a page every role can open (calendar, notifications, profile, …) in
 * the layout for the viewer's role. Parents get ParentLayout — falling back
 * to StudentLayout gave them a sidebar of /dashboard/student/* links that
 * ProtectedRoute bounces them away from.
 */
export function RoleLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role = user?.role;
  if (role === "admin" || role === "super_admin") return <AdminLayout>{children}</AdminLayout>;
  if (role === "teacher") return <TeacherLayout>{children}</TeacherLayout>;
  if (role === "parent") return <ParentLayout>{children}</ParentLayout>;
  return <StudentLayout>{children}</StudentLayout>;
}
