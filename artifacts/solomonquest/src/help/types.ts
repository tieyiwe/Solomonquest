/**
 * Help Center content model.
 *
 * Every guide is plain typed data (see ./guides/*.ts) so it can be edited
 * without touching any component. A guide is either:
 *   - "animated": a stylised mini mock of the real screen (MockScreen) with a
 *     cursor that moves to each step's `target`, a pulse on it and a caption; or
 *   - "steps":    numbered text steps with short tips.
 * Animated guides can always be shown as text steps too.
 */

/** Who a guide is written for. "visitor" = signed-out people. */
export type Audience = "visitor" | "student" | "teacher" | "admin" | "staff" | "parent" | "super_admin";

export type CategoryId =
  | "start"
  | "account"
  | "communication"
  | "learning"
  | "grades"
  | "payments"
  | "teaching"
  | "grading"
  | "people"
  | "academics"
  | "finance"
  | "certificates"
  | "insights"
  | "school-setup"
  | "platform";

export interface HelpCategoryInfo {
  id: CategoryId;
  title: string;
  blurb: string;
  /** lucide icon name, resolved in the page */
  icon: string;
}

// ─── Mock screen DSL ─────────────────────────────────────────────────────────

export type MockTone = "default" | "success" | "warning" | "danger" | "gold" | "muted" | "primary";

export type MockEl =
  | { k: "button"; id?: string; label: string; variant?: "primary" | "outline" | "gold" | "ghost" | "danger"; icon?: string; small?: boolean }
  | { k: "tabs"; id?: string; items: string[]; active?: number }
  | { k: "field"; id?: string; label: string; value?: string; placeholder?: string; multiline?: boolean; type?: "password" }
  | { k: "select"; id?: string; label: string; value?: string; placeholder?: string }
  | { k: "toggle"; id?: string; label: string; hint?: string; on?: boolean }
  | { k: "check"; id?: string; label: string; on?: boolean }
  | { k: "upload"; id?: string; label: string; hint?: string; file?: string }
  | { k: "table"; id?: string; cols: string[]; rows: string[][]; rowIds?: string[]; highlightRow?: number }
  | { k: "card"; id?: string; title?: string; text?: string; children?: MockEl[]; tone?: MockTone; badge?: string }
  | { k: "row"; id?: string; children: MockEl[]; justify?: "between" | "start" | "end"; wrap?: boolean }
  | { k: "cols"; id?: string; children: MockEl[] }
  | { k: "stats"; id?: string; items: { label: string; value: string; tone?: MockTone }[] }
  | { k: "badge"; id?: string; label: string; tone?: MockTone }
  | { k: "list"; id?: string; items: { id?: string; title: string; meta?: string; badge?: string; tone?: MockTone; icon?: string }[] }
  | { k: "text"; id?: string; text: string; muted?: boolean; small?: boolean; bold?: boolean }
  | { k: "heading"; id?: string; text: string }
  | { k: "progress"; id?: string; label: string; value: number }
  | { k: "chat"; id?: string; messages: { from: string; text: string; me?: boolean }[] }
  | { k: "calendar"; id?: string; month: string; events: { day: number; label: string; tone?: MockTone }[] }
  | { k: "chart"; id?: string; bars: number[]; labels?: string[] }
  | { k: "video"; id?: string; label?: string; progress?: number }
  | { k: "certificate"; id?: string; name: string; course: string; school?: string }
  | { k: "avatar"; id?: string; initials: string; label?: string; photo?: boolean }
  | { k: "dialog"; id: string; title: string; children: MockEl[]; open?: boolean }
  | { k: "menu"; id: string; items: { id?: string; label: string; icon?: string }[]; open?: boolean; align?: "right" | "left" }
  | { k: "toast"; id: string; text: string; open?: boolean; tone?: MockTone };

/** Which chrome to draw around the screen. */
export type MockChrome = "student" | "teacher" | "admin" | "parent" | "super_admin" | "public";

export interface MockScreen {
  chrome: MockChrome;
  /** sidebar label to show as current; nav items get ids "nav:<label>" */
  active?: string;
  title: string;
  subtitle?: string;
  /** buttons/menus at the right of the page header */
  actions?: MockEl[];
  body: MockEl[];
}

/** Per-element state overrides, keyed by element id: merged onto the element's props. */
export type MockState = Record<string, Record<string, unknown>>;

// ─── Guides ──────────────────────────────────────────────────────────────────

export interface GuideStep {
  /** Short caption headline, e.g. "Open Gradebook". */
  title: string;
  /** One or two friendly sentences. */
  text: string;
  /** Optional extra tip shown under the step. */
  tip?: string;
  /** Mock element id the cursor points to in this step ("nav:Users", "btn-invite", …). */
  target?: string;
  /** Which screen (key of guide.screens) this step shows. Defaults to the previous step's. */
  screen?: string;
  /** State changes visible from this step on (open a dialog, type a value, flip a toggle…). */
  set?: MockState;
}

export interface Guide {
  slug: string;
  title: string;
  /** One-line plain-language summary. */
  summary: string;
  roles: Audience[];
  category: CategoryId;
  format: "animated" | "steps";
  steps: GuideStep[];
  /** Mock screens for animated guides; the first key is the starting screen. */
  screens?: Record<string, MockScreen>;
  /** Extra search words. */
  keywords?: string[];
  /** Where this lives in the app, e.g. "/dashboard/teacher/gradebook". */
  path?: string;
  /** Human path, e.g. "Sidebar → Gradebook". */
  where?: string;
  troubleshoot?: { problem: string; fix: string }[];
  related?: string[];
}
