import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { requireSchoolFeature } from "../lib/featureFlags";
import { logger } from "../lib/logger";
import { isSmtpConfigured, sendEmailStrict } from "../lib/email";
import {
  checkPayment,
  checkReduction,
  checkRefund,
  computeStatement,
  allocationDiff,
  formatMoney,
  LEDGER_KINDS,
  normCurrency,
  PAYMENT_METHODS,
  todayUtc,
  toCsvCell,
  type BalanceFilter,
  type LedgerKind,
} from "../lib/tuitionLedgerCore";
import {
  getLedgerRow,
  getSchoolPaymentInfo,
  LedgerUnavailableError,
  loadStudentLedger,
  mapLedgerRow,
  mapStatement,
  profileNames,
  recordLedgerEntry,
  toLite,
  voidLedgerEntry,
  type LedgerRow,
} from "../lib/tuitionLedger";
import { buildBalanceRows, buildReceipt, statusCounts } from "../lib/tuitionBalances";
import { MAX_REMINDER_BATCH, previewReminders, sendReminders } from "../lib/tuitionReminders";
import { receiptEmailHtml } from "../lib/tuitionEmails";
import { sendPaymentConfirmation } from "../lib/paymentConfirmation";

/**
 * Tuition ledger routes: recording payments/discounts/refunds, voiding,
 * receipts, balances, payment instructions and balance reminders.
 *
 * The backend uses the service-role client (RLS bypassed), so every route
 * checks the caller's role and scopes every query to their school here.
 */

const router: IRouter = Router();

// Same rule as requireAccountingAccess in routes/accounting.ts: school admins
// and super_admin. Staff and teachers have no accounting access.
function canManageAccounting(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

function requireAccountingAccess(req: AuthenticatedRequest, res: Response): boolean {
  if (!canManageAccounting(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  if (!req.schoolId) {
    res.status(400).json({ error: "Your account isn't linked to a school." });
    return false;
  }
  return true;
}

function param(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function fail(res: Response, err: unknown, fallback: string): void {
  if (err instanceof LedgerUnavailableError) {
    res.status(503).json({ error: err.message });
    return;
  }
  logger.error({ err }, fallback);
  res.status(500).json({ error: (err as Error)?.message || fallback });
}

async function studentInSchool(studentId: string, schoolId: string): Promise<{ id: string; first_name: string | null; last_name: string | null; email: string | null } | null> {
  const { data } = await supabaseAdmin.from("profiles").select("id, school_id, first_name, last_name, email").eq("id", studentId).maybeSingle();
  if (!data || data.school_id !== schoolId) return null;
  return data as { id: string; first_name: string | null; last_name: string | null; email: string | null };
}

async function isParentOf(parentId: string, studentId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("parent_student_links")
    .select("id")
    .eq("parent_id", parentId)
    .eq("student_id", studentId)
    .maybeSingle();
  return !!data;
}

/** Full statement payload used by the admin drawer and the student/parent pages. */
async function statementPayload(schoolId: string, studentId: string, opts: { forAdmin: boolean }) {
  const [ledger, school] = await Promise.all([loadStudentLedger(schoolId, studentId), getSchoolPaymentInfo(schoolId)]);
  const visible = opts.forAdmin ? ledger.entries : ledger.entries.filter((e) => !e.voided_at || e.kind === "payment");
  const names = await profileNames([...visible.map((e) => e.recorded_by ?? ""), ...visible.map((e) => e.voided_by ?? "")]);
  let reminders: unknown[] = [];
  if (opts.forAdmin) {
    const { data } = await supabaseAdmin
      .from("tuition_reminders")
      .select("id, sent_at, sent_by, channels, email_status, parents_notified, balance_cents, overdue_cents, currency, custom_note")
      .eq("school_id", schoolId)
      .eq("student_id", studentId)
      .order("sent_at", { ascending: false })
      .limit(50);
    const senders = await profileNames((data ?? []).map((r) => r.sent_by as string));
    reminders = (data ?? []).map((r) => ({
      id: r.id,
      sentAt: r.sent_at,
      sentByName: r.sent_by ? senders.get(r.sent_by as string) ?? null : null,
      channels: r.channels ?? [],
      emailStatus: r.email_status,
      parentsNotified: r.parents_notified,
      balanceCents: r.balance_cents,
      overdueCents: r.overdue_cents,
      currency: r.currency,
      customNote: r.custom_note,
    }));
  }
  const plans = new Map<string, { paymentId: string; label: string; currency: string; amountCents: number }>();
  for (const i of ledger.items) {
    const p = plans.get(i.paymentId) ?? { paymentId: i.paymentId, label: i.planLabel, currency: i.currency, amountCents: 0 };
    p.amountCents += i.amountCents;
    plans.set(i.paymentId, p);
  }
  return {
    statement: mapStatement(ledger.statement),
    entries: visible
      .slice()
      .sort((a, b) => (a.paid_on === b.paid_on ? (a.recorded_at < b.recorded_at ? 1 : -1) : a.paid_on < b.paid_on ? 1 : -1))
      .map((e) => mapLedgerRow(e, names)),
    plans: Array.from(plans.values()),
    reminders,
    onlinePayments: school.onlinePayments,
    paymentInstructions: school.paymentInstructions,
    schoolName: school.name,
    legacy: ledger.legacy,
  };
}

function parseFilter(q: Record<string, unknown>): BalanceFilter {
  const num = (v: unknown) => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Math.round(Number(v) * 100);
    return Number.isFinite(n) ? n : undefined;
  };
  const sort = String(q.sort ?? "");
  return {
    status: typeof q.status === "string" ? q.status : undefined,
    programId: typeof q.programId === "string" && q.programId ? q.programId : undefined,
    courseId: typeof q.courseId === "string" && q.courseId ? q.courseId : undefined,
    overdue: q.overdue === "true" || q.overdue === "1",
    // minOwed / maxOwed are in major units (dollars), as typed by the admin.
    minOwedCents: num(q.minOwed),
    maxOwedCents: num(q.maxOwed),
    q: typeof q.q === "string" ? q.q : undefined,
    sort: (["balance_desc", "balance_asc", "due_asc", "due_desc", "name"].includes(sort) ? sort : "balance_desc") as BalanceFilter["sort"],
  };
}

// ─── Balances ────────────────────────────────────────────────────────────────
router.get("/accounting/balances", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  try {
    const schoolId = req.schoolId as string;
    const { all, rows, legacy } = await buildBalanceRows(schoolId, parseFilter(req.query as Record<string, unknown>));
    const programIds = Array.from(new Set(all.flatMap((r) => r.programIds)));
    const courseIds = Array.from(new Set(all.flatMap((r) => r.courseIds)));
    const [programs, courses, school] = await Promise.all([
      programIds.length ? supabaseAdmin.from("programs").select("id, name").in("id", programIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      courseIds.length ? supabaseAdmin.from("courses").select("id, title").in("id", courseIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      getSchoolPaymentInfo(schoolId),
    ]);
    res.json({
      rows,
      counts: statusCounts(all),
      facets: {
        programs: (programs.data ?? []).map((p) => ({ id: p.id, name: p.name })),
        courses: (courses.data ?? []).map((c) => ({ id: c.id, title: c.title })),
      },
      onlinePayments: school.onlinePayments,
      hasPaymentInstructions: !!school.paymentInstructions,
      legacy,
    });
  } catch (err) {
    fail(res, err, "Failed to load balances");
  }
});

router.get("/accounting/students/:studentId/statement", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const studentId = param(req.params.studentId);
  const student = await studentInSchool(studentId, req.schoolId as string);
  if (!student) {
    res.status(404).json({ error: "Student not found in your school" });
    return;
  }
  try {
    const payload = await statementPayload(req.schoolId as string, studentId, { forAdmin: true });
    res.json({
      student: { id: student.id, name: `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || "Student", email: student.email },
      ...payload,
    });
  } catch (err) {
    fail(res, err, "Failed to load statement");
  }
});

// ─── Record a payment / discount / waiver / refund / adjustment ─────────────
router.post(
  "/accounting/students/:studentId/ledger",
  requireAuth,
  requireSchoolFeature("tuition"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!requireAccountingAccess(req, res)) return;
    const schoolId = req.schoolId as string;
    const studentId = param(req.params.studentId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const kind = String(body.kind ?? "payment") as LedgerKind;
    if (!LEDGER_KINDS.includes(kind)) {
      res.status(400).json({ error: `kind must be one of ${LEDGER_KINDS.join(", ")}` });
      return;
    }
    const raw = Number(body.amountCents);
    if (!Number.isInteger(raw) || raw === 0 || Math.abs(raw) > 100_000_000_00) {
      res.status(400).json({ error: "amountCents must be a whole number of cents (not zero)." });
      return;
    }
    if (kind !== "adjustment" && raw < 0) {
      res.status(400).json({ error: "amountCents must be positive for this kind of entry." });
      return;
    }
    const method = body.method ? String(body.method) : null;
    if (kind === "payment" || kind === "refund") {
      if (!method || !(PAYMENT_METHODS as readonly string[]).includes(method)) {
        res.status(400).json({ error: `method must be one of ${PAYMENT_METHODS.join(", ")}` });
        return;
      }
    } else if (method && !(PAYMENT_METHODS as readonly string[]).includes(method)) {
      res.status(400).json({ error: "Unknown method" });
      return;
    }
    const paidOn = typeof body.paidOn === "string" && body.paidOn ? body.paidOn : todayUtc();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || Number.isNaN(Date.parse(paidOn))) {
      res.status(400).json({ error: "paidOn must be a date (YYYY-MM-DD)." });
      return;
    }
    // Allow "today" in any timezone, but not a future date.
    if (paidOn > new Date(Date.now() + 36 * 3600_000).toISOString().slice(0, 10)) {
      res.status(400).json({ error: "The date can't be in the future." });
      return;
    }
    const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
    const reference = text(body.reference, 120);
    const note = text(body.note, 1000);
    const label = text(body.label, 80);
    if (kind === "adjustment" && !note) {
      res.status(400).json({ error: "Add a note explaining the adjustment." });
      return;
    }

    const student = await studentInSchool(studentId, schoolId);
    if (!student) {
      res.status(404).json({ error: "Student not found in your school" });
      return;
    }

    try {
      const ledger = await loadStudentLedger(schoolId, studentId);
      if (ledger.legacy) throw new LedgerUnavailableError();

      // Optional earmark: a plan and/or one installment of it, which must
      // belong to this student.
      let paymentId = typeof body.paymentId === "string" && body.paymentId ? body.paymentId : null;
      const installmentId = typeof body.installmentId === "string" && body.installmentId ? body.installmentId : null;
      if (installmentId) {
        const item = ledger.items.find((i) => i.id === installmentId);
        if (!item) {
          res.status(400).json({ error: "That installment isn't one of this student's." });
          return;
        }
        if (paymentId && paymentId !== item.paymentId) {
          res.status(400).json({ error: "That installment belongs to a different plan." });
          return;
        }
        paymentId = item.paymentId;
      } else if (paymentId && !ledger.items.some((i) => i.paymentId === paymentId)) {
        res.status(400).json({ error: "That tuition plan isn't one of this student's." });
        return;
      }
      const planCurrency = paymentId ? ledger.items.find((i) => i.paymentId === paymentId)?.currency : undefined;
      const currency = normCurrency((body.currency as string) || planCurrency || ledger.statement.primaryCurrency);
      if (planCurrency && currency !== planCurrency) {
        res.status(400).json({ error: `That plan is billed in ${planCurrency.toUpperCase()}.` });
        return;
      }

      const amount = Math.abs(raw);
      const st = ledger.statement;
      let creditCents = 0;
      if (kind === "payment") {
        const check = checkPayment(st, amount, currency, body.allowCredit === true);
        if (!check.ok) {
          res.status(400).json({ error: check.error, code: "overpayment", outstandingCents: check.outstandingCents });
          return;
        }
        creditCents = check.creditCents;
      } else if (kind === "refund") {
        const err = checkRefund(st, amount, currency);
        if (err) {
          res.status(400).json({ error: err });
          return;
        }
      } else if (kind === "discount" || kind === "waiver" || (kind === "adjustment" && raw > 0)) {
        const err = checkReduction(st, amount, currency);
        if (err) {
          res.status(400).json({ error: err });
          return;
        }
      }

      const entry = await recordLedgerEntry({
        schoolId,
        studentId,
        kind,
        amountCents: kind === "adjustment" ? raw : amount,
        currency,
        paymentId,
        installmentId,
        method: kind === "payment" || kind === "refund" ? method : null,
        reference: reference || null,
        note: note || null,
        label: label || (kind === "discount" ? "Discount" : kind === "waiver" ? "Waiver" : null),
        paidOn,
        source: "manual",
        recordedBy: req.userId ?? null,
      });
      // Email + in-app receipt to the student for every payment, partial included.
      if (kind === "payment") void sendPaymentConfirmation(entry);

      const after = await loadStudentLedger(schoolId, studentId);
      const before = computeStatement(after.items, after.entries.filter((e) => e.id !== entry.id).map(toLite));
      const appliedTo = allocationDiff(before, after.statement).map((d) => {
        const item = after.items.find((i) => i.id === d.itemId);
        return {
          itemId: d.itemId,
          label: item ? (item.installmentCount > 1 ? `${item.planLabel}, installment ${item.installmentNumber} of ${item.installmentCount}` : item.planLabel) : "Tuition",
          amountCents: d.deltaCents,
        };
      });
      res.status(201).json({
        entry: mapLedgerRow(entry),
        appliedTo,
        creditCents,
        statement: mapStatement(after.statement),
        receiptPath: entry.receipt_number ? `/receipts/${entry.id}` : null,
      });
    } catch (err) {
      fail(res, err, "Failed to record the entry");
    }
  }
);

router.post("/accounting/ledger/:entryId/void", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
  if (reason.length < 3) {
    res.status(400).json({ error: "Give a short reason for voiding this entry." });
    return;
  }
  try {
    const existing = await getLedgerRow(param(req.params.entryId));
    if (!existing || existing.school_id !== req.schoolId) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    if (existing.voided_at) {
      res.status(409).json({ error: "This entry is already void." });
      return;
    }
    const row = await voidLedgerEntry(req.schoolId as string, existing.id, reason, req.userId ?? null);
    if (!row) {
      res.status(409).json({ error: "This entry is already void." });
      return;
    }
    const after = await loadStudentLedger(req.schoolId as string, row.student_id);
    res.json({ entry: mapLedgerRow(row), statement: mapStatement(after.statement) });
  } catch (err) {
    fail(res, err, "Failed to void the entry");
  }
});

// ─── Payment instructions (school setting) ──────────────────────────────────
router.get("/accounting/payment-instructions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const info = await getSchoolPaymentInfo(req.schoolId as string);
  res.json({ paymentInstructions: info.paymentInstructions ?? "", onlinePayments: info.onlinePayments, emailEnabled: isSmtpConfigured() });
});

router.put("/accounting/payment-instructions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const raw = req.body?.paymentInstructions;
  if (raw !== null && raw !== undefined && typeof raw !== "string") {
    res.status(400).json({ error: "paymentInstructions must be text" });
    return;
  }
  const value = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (value.length > 2000) {
    res.status(400).json({ error: "Keep payment instructions under 2,000 characters." });
    return;
  }
  const { error } = await supabaseAdmin
    .from("schools")
    .update({ payment_instructions: value || null })
    .eq("id", req.schoolId as string);
  if (error) {
    res.status(/payment_instructions/.test(error.message) ? 503 : 400).json({
      error: /payment_instructions/.test(error.message) ? "Run tuition-ledger.sql in the Supabase SQL editor first." : error.message,
    });
    return;
  }
  res.json({ paymentInstructions: value });
});

// ─── Reminders ───────────────────────────────────────────────────────────────
function reminderIds(body: Record<string, unknown>): string[] | null {
  const ids = body.studentIds;
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((x) => typeof x !== "string")) return null;
  return ids as string[];
}

router.post("/accounting/reminders/preview", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = reminderIds(body);
  if (!ids) {
    res.status(400).json({ error: "studentIds must be a non-empty list" });
    return;
  }
  if (ids.length > MAX_REMINDER_BATCH) {
    res.status(400).json({ error: `Send at most ${MAX_REMINDER_BATCH} reminders at a time.` });
    return;
  }
  try {
    res.json(await previewReminders({ schoolId: req.schoolId as string, sentBy: req.userId ?? null, studentIds: ids, note: body.note, override: body.override === true }));
  } catch (err) {
    fail(res, err, "Failed to preview reminders");
  }
});

router.post("/accounting/reminders/send", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const ids = reminderIds(body);
  if (!ids) {
    res.status(400).json({ error: "studentIds must be a non-empty list" });
    return;
  }
  if (ids.length > MAX_REMINDER_BATCH) {
    res.status(400).json({ error: `Send at most ${MAX_REMINDER_BATCH} reminders at a time.` });
    return;
  }
  try {
    const summary = await sendReminders({
      schoolId: req.schoolId as string,
      sentBy: req.userId ?? null,
      studentIds: ids,
      note: body.note,
      notifyParents: body.notifyParents === true,
      override: body.override === true,
    });
    res.json(summary);
  } catch (err) {
    fail(res, err, "Failed to send reminders");
  }
});

// ─── Receipts ────────────────────────────────────────────────────────────────
/** Admin of the entry's school, the student it belongs to, or a linked parent. */
async function canSeeEntry(req: AuthenticatedRequest, entry: LedgerRow): Promise<boolean> {
  if (canManageAccounting(req.userRole) && req.schoolId === entry.school_id) return true;
  if (req.userId === entry.student_id) return true;
  if (req.userRole === "parent" && req.userId) return isParentOf(req.userId, entry.student_id);
  return false;
}

router.get("/tuition/receipts/:entryId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const entry = await getLedgerRow(param(req.params.entryId));
    if (!entry || !(await canSeeEntry(req, entry))) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    if (entry.kind !== "payment" && entry.kind !== "refund") {
      res.status(404).json({ error: "Only payments and refunds have receipts" });
      return;
    }
    const school = await getSchoolPaymentInfo(entry.school_id);
    const receipt = await buildReceipt(entry, school.name);
    res.json({ ...receipt, schoolLogoUrl: school.logoUrl, canEmail: canManageAccounting(req.userRole) });
  } catch (err) {
    fail(res, err, "Failed to load the receipt");
  }
});

router.post("/tuition/receipts/:entryId/email", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  if (!isSmtpConfigured()) {
    res.status(503).json({ error: "Email isn't set up on this platform yet (SMTP is not configured)." });
    return;
  }
  try {
    const entry = await getLedgerRow(param(req.params.entryId));
    if (!entry || entry.school_id !== req.schoolId || (entry.kind !== "payment" && entry.kind !== "refund")) {
      res.status(404).json({ error: "Receipt not found" });
      return;
    }
    const school = await getSchoolPaymentInfo(entry.school_id);
    const receipt = await buildReceipt(entry, school.name);
    const recipients: { email: string; path: string }[] = [];
    if (receipt.studentEmail) recipients.push({ email: receipt.studentEmail, path: `/receipts/${entry.id}` });
    if (req.body?.includeParents === true) {
      const { data: links } = await supabaseAdmin.from("parent_student_links").select("parent_id").eq("student_id", entry.student_id);
      const pids = (links ?? []).map((l) => l.parent_id as string);
      if (pids.length) {
        const { data: parents } = await supabaseAdmin.from("profiles").select("id, email").in("id", pids);
        for (const p of parents ?? []) if (p.email) recipients.push({ email: p.email as string, path: `/receipts/${entry.id}` });
      }
    }
    if (!recipients.length) {
      res.status(400).json({ error: "This student has no email address on file." });
      return;
    }
    const subject = `${school.name}: receipt ${receipt.receiptNumber ?? ""} for ${formatMoney(receipt.amountCents, receipt.currency)}`.replace(/\s+/g, " ");
    let emailed = 0;
    const failed: string[] = [];
    for (const r of recipients) {
      try {
        await sendEmailStrict(r.email, subject, receiptEmailHtml(receipt, { name: school.name, logoUrl: school.logoUrl }, r.path));
        emailed += 1;
      } catch (err) {
        logger.error({ err }, "receipt email failed");
        failed.push(r.email);
      }
    }
    res.json({ emailed, failed: failed.length, recipients: recipients.length });
  } catch (err) {
    fail(res, err, "Failed to email the receipt");
  }
});

// ─── Student / parent statements ─────────────────────────────────────────────
router.get("/tuition/me/statement", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!req.userId || !req.schoolId) {
    res.status(400).json({ error: "Your account isn't linked to a school." });
    return;
  }
  try {
    res.json(await statementPayload(req.schoolId, req.userId, { forAdmin: false }));
  } catch (err) {
    fail(res, err, "Failed to load your balance");
  }
});

router.get("/tuition/students/:studentId/statement", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const studentId = param(req.params.studentId);
  const isAdmin = canManageAccounting(req.userRole);
  const allowed =
    req.userId === studentId ||
    (req.userRole === "parent" && !!req.userId && (await isParentOf(req.userId, studentId))) ||
    isAdmin;
  if (!allowed) {
    res.status(403).json({ error: "You can only see your own (or your linked student's) tuition." });
    return;
  }
  const { data: student } = await supabaseAdmin.from("profiles").select("id, school_id, first_name, last_name").eq("id", studentId).maybeSingle();
  if (!student?.school_id || (isAdmin && req.userId !== studentId && student.school_id !== req.schoolId)) {
    res.status(404).json({ error: "Student not found" });
    return;
  }
  try {
    const payload = await statementPayload(student.school_id as string, studentId, { forAdmin: false });
    res.json({ student: { id: studentId, name: `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() }, ...payload });
  } catch (err) {
    fail(res, err, "Failed to load the balance");
  }
});

// ─── CSV: balances ──────────────────────────────────────────────────────────
router.get("/accounting/export/balances", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  try {
    const { rows } = await buildBalanceRows(req.schoolId as string, parseFilter(req.query as Record<string, unknown>));
    const out: (string | number | null)[][] = [
      ["Student Name", "Student Email", "Status", "Currency", "Billed", "Paid", "Discounts", "Outstanding", "Credit", "Overdue", "Next Due Date", "Next Due Amount", "Last Payment", "Last Reminded", "Plans"],
    ];
    const label: Record<string, string> = { paid: "Paid in full", partial: "Partially paid", owing: "Owing", overdue: "Overdue" };
    const m = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));
    for (const r of rows) {
      for (const t of [{ currency: r.currency, billedCents: r.totalBilledCents, paidCents: r.totalPaidCents, discountCents: r.totalDiscountCents, outstandingCents: r.balanceCents, creditCents: r.creditCents, overdueCents: r.overdueCents }, ...r.otherCurrencies]) {
        out.push([
          r.studentName, r.studentEmail ?? "", label[r.status] ?? r.status, t.currency.toUpperCase(), m(t.billedCents), m(t.paidCents), m(t.discountCents),
          m(t.outstandingCents), m(t.creditCents), m(t.overdueCents), r.nextDueDate ?? "", m(r.nextDueAmountCents), r.lastPaymentAt ?? "", r.lastRemindedAt ?? "",
          r.plans.map((p) => p.label).join("; "),
        ]);
      }
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="student-balances-${todayUtc()}.csv"`);
    res.send(out.map((row) => row.map(toCsvCell).join(",")).join("\n"));
  } catch (err) {
    fail(res, err, "Failed to export balances");
  }
});

export default router;
