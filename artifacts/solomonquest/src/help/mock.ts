/**
 * Tiny builders for the mock-screen DSL, so guide files stay short and
 * readable. Sidebar labels mirror the real layouts (AdminLayout,
 * TeacherLayout, StudentLayout, SuperAdminDashboard) — keep them in sync
 * when the real navigation changes.
 */
import type { MockChrome, MockEl, MockScreen, MockTone } from "./types";

export const NAV: Record<MockChrome, string[]> = {
  student: ["Overview", "Calendar", "Assignments", "Quizzes", "Forum", "Transcript", "Progress report", "Chat", "Tuition", "Certificates"],
  teacher: ["Overview", "Calendar", "Assignments", "Gradebook", "Attendance", "Resources", "Analytics", "At-risk students", "Reminders", "Question Banks", "Chat"],
  admin: [
    "Overview", "Calendar", "Analytics", "Users", "Courses", "Programs", "Terms & Scheduling", "Admissions",
    "Resources", "At-risk students", "Certificates", "Question Banks", "Tuition", "Accounting", "Chat",
    "Help Center", "Audit Log", "Bulk Import", "Settings",
  ],
  super_admin: [
    "Dashboard", "Analytics", "Schools", "School Requests", "All Users", "Deletion Requests", "Domain Requests",
    "Subscriptions", "Usage & Costs", "Archive", "Audit Log", "Platform Settings", "Advanced Settings",
  ],
  parent: [],
  public: [],
};

export const CHROME_LABEL: Record<MockChrome, string> = {
  student: "Student Portal",
  teacher: "Teacher Portal",
  admin: "Admin",
  super_admin: "Super Admin Console",
  parent: "Parent",
  public: "SolomonQuest",
};

export function screen(chrome: MockChrome, active: string | undefined, title: string, body: MockEl[], extra: Partial<MockScreen> = {}): MockScreen {
  return { chrome, active, title, body, ...extra };
}

export const btn = (id: string, label: string, variant: "primary" | "outline" | "gold" | "ghost" | "danger" = "primary", icon?: string): MockEl =>
  ({ k: "button", id, label, variant, icon });
export const small = (id: string, label: string, variant: "primary" | "outline" | "gold" | "ghost" | "danger" = "outline", icon?: string): MockEl =>
  ({ k: "button", id, label, variant, icon, small: true });
export const tabs = (id: string, items: string[], active = 0): MockEl => ({ k: "tabs", id, items, active });
export const field = (id: string, label: string, value?: string, placeholder?: string): MockEl => ({ k: "field", id, label, value, placeholder });
export const area = (id: string, label: string, value?: string, placeholder?: string): MockEl => ({ k: "field", id, label, value, placeholder, multiline: true });
export const select = (id: string, label: string, value?: string, placeholder = "Select…"): MockEl => ({ k: "select", id, label, value, placeholder });
export const toggle = (id: string, label: string, on = false, hint?: string): MockEl => ({ k: "toggle", id, label, on, hint });
export const check = (id: string, label: string, on = false): MockEl => ({ k: "check", id, label, on });
export const upload = (id: string, label: string, hint?: string): MockEl => ({ k: "upload", id, label, hint });
export const table = (id: string, cols: string[], rows: string[][], rowIds?: string[]): MockEl => ({ k: "table", id, cols, rows, rowIds });
export const card = (id: string, title: string | undefined, children: MockEl[] = [], text?: string, tone?: MockTone): MockEl => ({ k: "card", id, title, children, text, tone });
export const row = (children: MockEl[], justify: "between" | "start" | "end" = "start", id?: string): MockEl => ({ k: "row", children, justify, id, wrap: true });
export const cols = (children: MockEl[], id?: string): MockEl => ({ k: "cols", children, id });
export const stats = (items: { label: string; value: string; tone?: MockTone }[], id?: string): MockEl => ({ k: "stats", items, id });
export const badge = (id: string, label: string, tone: MockTone = "default"): MockEl => ({ k: "badge", id, label, tone });
export const list = (id: string, items: { id?: string; title: string; meta?: string; badge?: string; tone?: MockTone; icon?: string }[]): MockEl => ({ k: "list", id, items });
export const text = (t: string, muted = true, id?: string): MockEl => ({ k: "text", text: t, muted, id, small: true });
export const heading = (t: string, id?: string): MockEl => ({ k: "heading", text: t, id });
export const progress = (id: string, label: string, value: number): MockEl => ({ k: "progress", id, label, value });
export const dialog = (id: string, title: string, children: MockEl[]): MockEl => ({ k: "dialog", id, title, children, open: false });
export const menu = (id: string, items: { id?: string; label: string; icon?: string }[], align: "right" | "left" = "right"): MockEl => ({ k: "menu", id, items, open: false, align });
export const toast = (id: string, t: string, tone: MockTone = "success"): MockEl => ({ k: "toast", id, text: t, open: false, tone });
export const video = (id: string, label = "Lesson video", progressPct = 0): MockEl => ({ k: "video", id, label, progress: progressPct });
export const chat = (id: string, messages: { from: string; text: string; me?: boolean }[]): MockEl => ({ k: "chat", id, messages });

/** Shorthand for "this step opens dialog X". */
export const open = (id: string) => ({ [id]: { open: true } });
/** Shorthand for "this step closes dialog X". */
export const close = (id: string) => ({ [id]: { open: false } });
