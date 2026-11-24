import type { Audience, CategoryId, Guide, HelpCategoryInfo } from "../types";
import { visitorGuides } from "./visitor";
import { everyoneGuides } from "./everyone";
import { studentGuides } from "./student";
import { teacherGuides } from "./teacher";
import { adminGuides } from "./admin";
import { parentGuides, staffGuides } from "./parent-staff";
import { superAdminGuides } from "./superAdmin";
import { admissionsGuides } from "./admissions";

export const GUIDES: Guide[] = [
  ...visitorGuides,
  ...everyoneGuides,
  ...studentGuides,
  ...teacherGuides,
  ...adminGuides,
  ...parentGuides,
  ...staffGuides,
  ...superAdminGuides,
  ...admissionsGuides,
];

const BY_SLUG = new Map(GUIDES.map((g) => [g.slug, g]));
export const getGuide = (slug: string | undefined | null): Guide | undefined => (slug ? BY_SLUG.get(slug) : undefined);

export const CATEGORIES: HelpCategoryInfo[] = [
  { id: "start", title: "Getting started", blurb: "Joining, signing in and first steps", icon: "rocket" },
  { id: "account", title: "Your account", blurb: "Profile, password, email and notifications", icon: "user" },
  { id: "communication", title: "Chat, messages & calendar", blurb: "Talk to your school and keep track of dates", icon: "message" },
  { id: "learning", title: "Courses & coursework", blurb: "Lessons, assignments, quizzes and live classes", icon: "book" },
  { id: "grades", title: "Grades & certificates", blurb: "Transcripts, progress reports and certificates", icon: "award" },
  { id: "payments", title: "Tuition & payments", blurb: "Balances and paying online", icon: "card" },
  { id: "teaching", title: "Teaching", blurb: "Build courses, assignments and quizzes", icon: "pen" },
  { id: "grading", title: "Grading & attendance", blurb: "Gradebook, rubrics and attendance", icon: "check" },
  { id: "insights", title: "Reports & insights", blurb: "At-risk students, progress reports, analytics", icon: "chart" },
  { id: "people", title: "People & invitations", blurb: "Invite, import and manage users", icon: "users" },
  { id: "academics", title: "Programs, courses & admissions", blurb: "Structure your school and admit students", icon: "layers" },
  { id: "finance", title: "Tuition, Stripe & accounting", blurb: "Get paid and keep the books", icon: "wallet" },
  { id: "certificates", title: "Certificates", blurb: "Design, approve and revoke certificates", icon: "award" },
  { id: "school-setup", title: "School setup & settings", blurb: "Branding, permissions, reminders, audit log", icon: "settings" },
  { id: "platform", title: "Platform administration", blurb: "Schools, feature flags, usage and settings", icon: "shield" },
];
export const categoryInfo = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!;

export const AUDIENCE_LABEL: Record<Audience, string> = {
  visitor: "Visitors",
  student: "Students",
  teacher: "Teachers",
  admin: "School admins",
  staff: "Staff",
  parent: "Parents",
  super_admin: "Super admins",
};

/** "Popular for you" per audience, in order. */
export const POPULAR: Record<Audience, string[]> = {
  visitor: ["find-a-school", "apply-to-a-school", "accept-an-invite", "sign-in-and-reset-password"],
  student: ["student-submit-assignment", "student-take-a-quiz", "student-modules-and-lessons", "student-live-class-checkin", "student-pay-tuition", "student-grades-and-transcript"],
  staff: ["staff-getting-started", "admin-terms", "profile-photo-and-details", "chat", "forum"],
  teacher: ["teacher-gradebook-rubrics", "teacher-quiz-builder", "teacher-create-assignment", "teacher-modules-and-lessons", "teacher-attendance", "teacher-at-risk"],
  parent: ["parent-getting-linked", "parent-dashboard", "parent-notifications", "change-password"],
  admin: ["admin-invite-people", "admin-bulk-import", "admin-courses", "admin-stripe-connect", "admin-accounting", "admin-certificate-settings"],
  super_admin: ["super-console-tour", "super-schools", "super-feature-flags", "super-usage-analytics", "super-advanced-settings"],
};

/** Guides written for an audience ("all" = every guide). */
export function guidesFor(aud: Audience | "all"): Guide[] {
  return aud === "all" ? GUIDES : GUIDES.filter((g) => g.roles.includes(aud));
}

/** Whether a viewer may open a guide. Admins and super admins may open every guide. */
export function canView(viewer: Audience, g: Guide): boolean {
  if (viewer === "admin" || viewer === "super_admin") return true;
  return g.roles.includes(viewer);
}

/** Estimated reading/watching time in minutes. */
export function readMinutes(g: Guide): number {
  const words = [g.summary, ...g.steps.flatMap((s) => [s.title, s.text, s.tip ?? ""]), ...(g.troubleshoot ?? []).flatMap((t) => [t.problem, t.fix])]
    .join(" ").split(/\s+/).filter(Boolean).length;
  const seconds = (words / 200) * 60 + (g.format === "animated" ? g.steps.length * 4.5 : 0);
  return Math.max(1, Math.ceil(seconds / 60));
}

/** Simple ranked search: every word must match somewhere; title and keywords weigh more. */
export function searchGuides(pool: Guide[], query: string): Guide[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored: { g: Guide; score: number }[] = [];
  for (const g of pool) {
    const title = g.title.toLowerCase();
    const keys = (g.keywords ?? []).join(" ").toLowerCase();
    const summary = `${g.summary} ${g.where ?? ""}`.toLowerCase();
    const body = g.steps.map((s) => `${s.title} ${s.text} ${s.tip ?? ""}`).join(" ").toLowerCase();
    let score = 0;
    let all = true;
    for (const w of words) {
      const s = (title.includes(w) ? 4 : 0) + (keys.includes(w) ? 3 : 0) + (summary.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0);
      if (!s) { all = false; break; }
      score += s;
    }
    if (all) scored.push({ g, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.g);
}
