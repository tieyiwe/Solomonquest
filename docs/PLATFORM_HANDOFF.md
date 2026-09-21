# SolomonQuest — Platform Handoff Documentation

This is the primary reference for a new engineer or team taking over
SolomonQuest, a multi-tenant school LMS. Read this before touching the
codebase. It covers architecture, conventions, deployment, and the sharp
edges that have caused real production bugs.

## 1. What this app is

SolomonQuest is a multi-tenant Learning Management System. Each **school**
is a tenant: it has its own users (admins, teachers, students, staff,
parents), courses, programs, admissions/applications, forum, chat, video
calls, tuition/payments, and accounting. A **super_admin** role sits above
all schools and manages the platform itself (school approval/suspension,
feature flags per school, usage/cost analytics, platform-wide audit log).

## 2. Repo layout

```
artifacts/
  api-server/     Express backend (TypeScript)
    src/routes/   One file per feature area — see "Route map" below
    src/lib/      Shared backend logic (Stripe, Supabase client, auth, etc.)
    src/middlewares/
  solomonquest/   React + Vite frontend (TypeScript)
    src/pages/    admin/, super-admin/, student/, teacher/, parent/, staff/
    src/components/
    src/Router.tsx  All routes registered here
*.sql             Every migration lives as its own file at repo ROOT,
                   not in artifacts/. NOT consolidated into one schema file.
verify-migrations.sql   Run this after applying migrations to confirm
                         every column/table this codebase expects exists.
```

There is no `artifacts/db` migration runner — migrations are plain `.sql`
files applied manually in the Supabase SQL editor. This is the single most
important thing to understand about this codebase (see section 5).

## 3. Stack

- **Frontend**: React + Vite + TypeScript, Tailwind, shadcn/ui components,
  `wouter` for routing (not react-router), `@tanstack/react-query` via
  `@workspace/api-client-react` codegen where used, `sonner` for toasts.
- **Backend**: Express 5 + TypeScript, esbuild bundle (`pnpm run build` in
  `artifacts/api-server`).
- **Database/Auth**: Supabase (Postgres + Auth). The backend uses
  `supabaseAdmin` — a **service-role client that bypasses Row Level
  Security entirely**. This is the most important security fact in the
  codebase: every route is solely responsible for its own authorization.
  There is no DB-level safety net. RLS policies on tables exist but are
  set to `for all using (true)` — i.e. they do nothing; they're present
  only so RLS can be "enabled" without breaking the service-role client.
- **Payments**: Stripe, with **Stripe Connect (Standard accounts)** — each
  school connects its own independent Stripe account; tuition charges
  settle directly on the school's account via `{stripeAccount: id}` on
  the Checkout Session call, never touching the platform's own Stripe
  balance.
- **AI agent**: Anthropic API (`ANTHROPIC_MODEL` / `ANTHROPIC_MODEL_FAST`
  env vars pick which Claude model handles agent requests, with a fast/
  cheap model used for simple routed tasks).

## 4. Required environment variables

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Backend's admin Supabase client. **Required** — nothing works without it. |
| `SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Frontend Supabase client (anon key, RLS-respecting, used only for auth session). |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ANTHROPIC_MODEL_FAST` | AI agent. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Tuition payments + Stripe Connect. Without these, `isStripeConfigured()` returns false and payment routes 503 gracefully — the rest of the app still works. |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Transactional email. |
| `VIRUSTOTAL_API_KEY` | Uploaded file scanning (`lib/fileScan.ts`). |
| `ALLOWED_ORIGINS`, `APP_URL`, `FRONTEND_URL` | CORS + link generation (Stripe return URLs, email links). |
| `NODE_ENV`, `LOG_LEVEL` | Standard. |

**This sandbox/dev environment has no `SUPABASE_SERVICE_ROLE_KEY`**, so the
backend cannot be run live in some environments — verification there has
to be static (typecheck + build), not live testing. Confirm which is true
of your environment before assuming you can run the server locally.

## 5. Database migrations — READ THIS BEFORE CHANGING SCHEMA

This is the dominant source of bugs in this codebase's history. There is
**no migration framework**. Every schema change is its own `.sql` file at
the repo root (e.g. `stripe-connect.sql`, `accounting-suite.sql`,
`usage-tracking.sql`). Convention for every new file:

- Idempotent: `create table if not exists`, `alter table ... add column
  if not exists`.
- RLS: `alter table X enable row level security;` followed by
  `create policy "X_all" on X for all using (true) with check (true);`
  (matches every other table — RLS is nominally on but permissive, since
  only the service-role client touches these tables).
- After writing the migration, **append a check row to
  `verify-migrations.sql`** following its existing pattern exactly (an
  `exists(select 1 from information_schema...)` check per migration,
  unioned into one query, sorted `ok asc` so failures surface first). Run
  that file after applying migrations in Supabase to confirm everything
  landed.

**Schema drift — code referencing a column/table that was never actually
created in any `.sql` file — has been the single most common bug class in
this project's history**, discovered and fixed across at least three
dedicated audit passes. Before writing a Supabase query against a table,
grep the `.sql` files at repo root for that table's `create table`
statement and confirm every column you're using actually exists there.
There is no single consolidated schema file — check
`supabase-schema-additions.sql`, `schema-drift-fixes.sql`, and every other
topical `.sql` file; they're additive, not layered in one place.

## 6. Route map (backend)

All registered in `artifacts/api-server/src/routes/index.ts`. Each file
below is `requireAuth`-gated per-route (not globally) — check each route
individually, don't assume a whole file requires auth.

| File | Covers |
|---|---|
| `auth.ts` | Session/login glue |
| `users.ts`, `permissions.ts`, `impersonation.ts` | User management, role permissions, super-admin "log in as" |
| `schools.ts`, `school-requests.ts`, `school-resources.ts` | School CRUD, creation-request approval flow, school-level file resources |
| `super-admin.ts` | Everything platform-level: dashboard stats, schools list/archive/delete, feature flags, usage & cost analytics, platform audit log |
| `courses.ts`, `programs.ts`, `terms.ts`, `course-resources.ts` | Academic structure |
| `applications.ts` | Prospective-student applications (auto-enroll on approval) |
| `assignments.ts`, `submissions.ts`, `grading.ts`, `quizzes.ts` | Coursework |
| `attendance.ts` | Attendance tracking |
| `chat.ts`, `messages.ts`, `forum.ts`, `video.ts` | Real-time-ish communication, gated by feature flags |
| `notes.ts` | Student/teacher notes |
| `calendar.ts`, `reminders.ts`, `notifications.ts` | Scheduling + the notification/reminder delivery pipeline |
| `announcements.ts` | School-wide announcements |
| `tuition.ts`, `stripe-connect.ts`, `stripe-webhook.ts`, `accounting.ts` | Payments: tuition plans/payments/installments, per-school Stripe Connect onboarding, webhook handling, expense tracking + P&L |
| `agent.ts` | AI assistant (tool-calling, rate limiting, model routing) |
| `analytics.ts`, `dashboard.ts`, `activityLog.ts` | Reporting |
| `form-builder.ts` | Custom form fields for admissions |
| `parents.ts` | Parent-student linking |
| `invitations.ts` | User invite flow |
| `search.ts` | Global search |
| `fileConverter.ts`, `health.ts` | Utility |

## 7. Key shared libraries (`src/lib/`)

- `supabase.ts` — exports `supabaseAdmin` (service-role, bypasses RLS).
- `featureFlags.ts` — `requireSchoolFeature(key)` middleware; per-school
  toggle checked against `schools.enabled_features` JSON column, short
  TTL cache. Keys: `chat`, `video_calls`, `forum`, `ai_agent`,
  `custom_domain`, `notes`, `tuition`. Designed as the foundation for
  future subscription-plan-based gating, not just an on/off switch.
- `usageTracking.ts` — `logUsageEvent()` fire-and-forget writes to
  `usage_events` (AI tokens, chat/forum/video activity) for the super
  admin's per-school/per-user cost analytics.
- `stripe.ts` — Stripe client + Connect helpers (`createConnectAccount`,
  `createConnectOnboardingLink`, `createConnectLoginLink`,
  `getConnectAccountStatus`). `isStripeConfigured()` gates all payment
  routes so the app degrades gracefully without Stripe keys set.
- `profileCache.ts` — short-TTL cache for profile lookups (perf).
- `notifications.ts` — writes to the `notifications` table, what the
  bell icon reads.
- `auditLog.ts` — writes to `platform_audit_log` (super-admin actions).
- `verifyToken.ts` — Supabase JWT verification, backs `requireAuth`.
- `fileScan.ts` — VirusTotal scan for uploads.
- `gradingEngine.ts` — quiz/assignment grading logic.

## 8. Architecture decisions worth knowing

- **Service-role client + no RLS enforcement** means every single route
  handler is a potential IDOR if it trusts a client-supplied id without
  checking `school_id`/`user_id` ownership. When adding a new route that
  reads/writes by id, always scope the query to `req.schoolId` and/or
  `req.userId` — never trust `req.body.schoolId` or similar.
- **Stripe Connect Standard accounts** (not Express/Custom) were chosen
  specifically so each school owns and controls its own real Stripe
  dashboard — "independent of the platform" was an explicit product
  requirement, not just a payments implementation detail.
- **Feature flags double as future plan-tiering** — the
  `requireSchoolFeature` system was deliberately built so per-school
  feature toggles (currently manual, in Super Admin → Feature Flags) can
  later be driven by a subscription plan instead of a manual super-admin
  toggle, without changing the enforcement code.
- **camelCase over the wire, snake_case in Postgres** — every route maps
  `snake_case` DB columns to `camelCase` JSON manually (no ORM
  auto-mapping). Mismatches between a route's mapping function and what
  the frontend destructures fail **silently** as `undefined`, not as a
  thrown error — this has caused several bugs. When adding a field, grep
  both the backend mapper and the frontend `interface`/type that consumes
  it.
- **`wouter`, not `react-router`** for frontend routing — don't add
  react-router imports.

## 9. Testing / verification workflow

There are no meaningful automated test suites yet. Verification before
any commit:

```bash
cd artifacts/api-server && npx tsc -p tsconfig.json --noEmit
cd artifacts/solomonquest && npx tsc --noEmit -p tsconfig.json
```
Compare the error count against the last known-good baseline (check
recent commit messages / CI if configured) — don't treat a matching
count as a regression, only genuinely new errors.

```bash
cd artifacts/api-server && pnpm run build
cd artifacts/solomonquest && pnpm run build
```
Build each package **individually** — never from the repo root.

There is no way to run the backend live without a real
`SUPABASE_SERVICE_ROLE_KEY` and a real Supabase project. In any
environment lacking that, all verification must be static (typecheck +
build + manual schema cross-referencing against the `.sql` files) — never
claim to have "tested" a route you couldn't actually execute.

## 10. Known gaps / follow-ups for the next team

- **No `account.updated` Stripe webhook handler.** A school's Connect
  status (`stripe_connect_status`) only refreshes when someone loads the
  Tuition page (`GET /schools/:id/stripe/status` calls Stripe live).
  `checkout.session.completed` works fine regardless. Adding a dedicated
  webhook handler for `account.updated` would give near-real-time status
  without polling.
- **No automated test suite.** All verification is currently manual
  (typecheck/build + manual QA against the feature list in this repo's
  docs). Worth prioritizing at least integration tests for the payment
  and auth-scoping code paths given how many IDOR/schema-drift bugs have
  been found by manual audit.
- **`replit.md` at repo root is an unfilled template** — was never
  populated; this document supersedes it as the source of truth, but
  someone should either fill in or delete `replit.md` to avoid confusion.
- Feature-per-plan tiering (mentioned in section 8) is architecturally
  supported by `featureFlags.ts` but not yet connected to any actual
  billing/subscription-plan logic — `schools.plan`/`subscription_status`
  columns exist but nothing currently changes `enabled_features`
  automatically based on them.

## 11. Where to look first for common tasks

- **Adding a new per-school feature that should be toggleable**: add the
  key to `FeatureKey` in `lib/featureFlags.ts`, wrap the route(s) with
  `requireSchoolFeature("your_key")`, add the toggle to the Feature Flags
  dialog in `SuperAdminDashboard.tsx`.
- **Adding a new table**: write a new root-level `.sql` file (idempotent,
  RLS policy, matches existing convention), append a check to
  `verify-migrations.sql`, then write the route(s) scoping every query to
  `req.schoolId`/`req.userId`.
- **Debugging "field is undefined in the UI but present in the network
  tab"**: almost always a camelCase/snake_case mismatch between the
  route's mapper function and the frontend's TypeScript interface — diff
  them directly rather than guessing.
- **Adding a payment-related feature**: read `tuition.ts`,
  `stripe-connect.ts`, and `accounting.ts` together — they share the
  `tuition_payments`/`tuition_installments` schema and the
  `stripeAccount` Connect pattern.
