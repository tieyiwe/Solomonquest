import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { requireSchoolFeature } from "../lib/featureFlags";
import { tuitionRevenueForRange, ledgerEntriesInRange, profileNames } from "../lib/tuitionLedger";
import { buildBalanceRows } from "../lib/tuitionBalances";
import { sendReminders } from "../lib/tuitionReminders";
import { METHOD_LABEL, toCsvCell, type PaymentMethod } from "../lib/tuitionLedgerCore";

const router: IRouter = Router();

function canManageAccounting(role: string | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

function requireAccountingAccess(req: AuthenticatedRequest, res: import("express").Response): boolean {
  if (!canManageAccounting(req.userRole)) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

function parseRange(req: AuthenticatedRequest): { from: string; to: string } {
  const { from, to } = req.query as { from?: string; to?: string };
  const now = new Date();
  // Both ends in UTC. `new Date(y, m, 1)` is LOCAL midnight of the 1st;
  // `.toISOString()` converts to UTC, which on a server ahead of UTC is the
  // last day of the previous month — so the default range silently started
  // one day early while `defaultTo` (already UTC) did not.
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  const defaultTo = now.toISOString().slice(0, 10);
  return { from: from || defaultFrom, to: to || defaultTo };
}

function mapExpense(e: Record<string, unknown>, creatorName?: string | null) {
  return {
    id: e.id,
    category: e.category,
    description: e.description,
    amountCents: e.amount_cents,
    currency: e.currency,
    expenseDate: e.expense_date,
    createdBy: e.created_by,
    createdByName: creatorName ?? null,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

// ─── EXPENSES ─────────────────────────────────────────────────────────────
router.get("/accounting/expenses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const { from, to } = parseRange(req);
  const { category } = req.query as { category?: string };

  let query = supabaseAdmin
    .from("expenses")
    .select("*")
    .eq("school_id", req.schoolId ?? "")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false });
  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const creatorIds = Array.from(new Set((data ?? []).map((e) => e.created_by).filter(Boolean) as string[]));
  const { data: creators } = creatorIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", creatorIds)
    : { data: [] as Record<string, unknown>[] };
  const nameById = new Map((creators ?? []).map((c) => [c.id, `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()]));

  res.json((data ?? []).map((e) => mapExpense(e, e.created_by ? nameById.get(e.created_by as string) : null)));
});

router.post(
  "/accounting/expenses",
  requireAuth,
  requireSchoolFeature("tuition"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!requireAccountingAccess(req, res)) return;

    const { category, description, amountCents, expenseDate } = req.body as {
      category?: string;
      description?: string;
      amountCents?: number;
      expenseDate?: string;
    };

    if (!description || !description.trim()) {
      res.status(400).json({ error: "description is required" });
      return;
    }
    if (amountCents === undefined || amountCents < 0) {
      res.status(400).json({ error: "amountCents is required and must be >= 0" });
      return;
    }

    const { data, error } = await supabaseAdmin
      .from("expenses")
      .insert({
        school_id: req.schoolId,
        category: category?.trim() || "other",
        description: description.trim(),
        amount_cents: amountCents,
        expense_date: expenseDate || new Date().toISOString().slice(0, 10),
        created_by: req.userId,
      })
      .select()
      .single();

    if (error || !data) {
      res.status(400).json({ error: error?.message ?? "Failed to create expense" });
      return;
    }

    res.status(201).json(mapExpense(data));
  }
);

router.put("/accounting/expenses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { category, description, amountCents, expenseDate } = req.body as {
    category?: string;
    description?: string;
    amountCents?: number;
    expenseDate?: string;
  };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (category !== undefined) update.category = category.trim() || "other";
  if (description !== undefined) {
    if (!description.trim()) {
      res.status(400).json({ error: "description cannot be empty" });
      return;
    }
    update.description = description.trim();
  }
  if (amountCents !== undefined) {
    if (amountCents < 0) {
      res.status(400).json({ error: "amountCents must be >= 0" });
      return;
    }
    update.amount_cents = amountCents;
  }
  if (expenseDate !== undefined) update.expense_date = expenseDate;

  const { data, error, count } = await supabaseAdmin
    .from("expenses")
    .update(update, { count: "exact" })
    .eq("id", id)
    .eq("school_id", req.schoolId ?? "")
    .select()
    .maybeSingle();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!count || !data) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }

  res.json(mapExpense(data));
});

router.delete("/accounting/expenses/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const { error, count } = await supabaseAdmin
    .from("expenses")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("school_id", req.schoolId ?? "");

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  if (!count) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.sendStatus(204);
});

// ─── P&L SUMMARY ────────────────────────────────────────────────────────────
// Revenue = sum of paid tuition_installments within range (timestamped by
// paid_at, so it reflects actual cash received, not when the plan/payment
// was created). Expenses = sum of expenses within range by expense_date.
router.get("/accounting/summary", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const { from, to } = parseRange(req);
  const schoolId = req.schoolId ?? "";

  const toExclusive = new Date(to);
  toExclusive.setDate(toExclusive.getDate() + 1);

  const [paidInstallmentsRes, expensesRes] = await Promise.all([
    supabaseAdmin
      .from("tuition_installments")
      .select("amount_cents, paid_at, payment_id, tuition_payments!inner(school_id)")
      .eq("status", "paid")
      .eq("tuition_payments.school_id", schoolId)
      .gte("paid_at", `${from}T00:00:00.000Z`)
      .lt("paid_at", toExclusive.toISOString().slice(0, 10) + "T00:00:00.000Z"),
    supabaseAdmin.from("expenses").select("amount_cents, category, expense_date").eq("school_id", schoolId).gte("expense_date", from).lte("expense_date", to),
  ]);

  if (paidInstallmentsRes.error) {
    res.status(500).json({ error: paidInstallmentsRes.error.message });
    return;
  }
  if (expensesRes.error) {
    res.status(500).json({ error: expensesRes.error.message });
    return;
  }

  // Tuition revenue comes from the ledger (payments minus refunds, by the
  // date received, voids excluded). Before tuition-ledger.sql is run, fall
  // back to the paid installments queried above.
  const ledgerRevenue = await tuitionRevenueForRange(schoolId, from, to).catch(() => null);
  const revenueRows: { amount_cents: number; paid_at: string }[] = ledgerRevenue
    ? ledgerRevenue.rows.map((r) => ({ amount_cents: r.amountCents, paid_at: r.date }))
    : ((paidInstallmentsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({ amount_cents: r.amount_cents as number, paid_at: r.paid_at as string }));
  const revenueCents = revenueRows.reduce((sum, r) => sum + r.amount_cents, 0);
  const expensesCents = (expensesRes.data ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0);

  const expensesByCategory = new Map<string, number>();
  for (const e of expensesRes.data ?? []) {
    const key = (e.category as string) || "other";
    expensesByCategory.set(key, (expensesByCategory.get(key) ?? 0) + (e.amount_cents as number));
  }

  // Monthly breakdown for a simple trend chart.
  const monthly = new Map<string, { revenueCents: number; expensesCents: number }>();
  for (const r of revenueRows) {
    const key = r.paid_at.slice(0, 7);
    const entry = monthly.get(key) ?? { revenueCents: 0, expensesCents: 0 };
    entry.revenueCents += r.amount_cents;
    monthly.set(key, entry);
  }
  for (const e of expensesRes.data ?? []) {
    const key = (e.expense_date as string).slice(0, 7);
    const entry = monthly.get(key) ?? { revenueCents: 0, expensesCents: 0 };
    entry.expensesCents += e.amount_cents as number;
    monthly.set(key, entry);
  }

  res.json({
    from,
    to,
    revenueCents,
    expensesCents,
    netCents: revenueCents - expensesCents,
    // Tuition revenue breakdown: revenueCents = tuitionCollectedCents - refundsCents.
    tuitionCollectedCents: ledgerRevenue ? ledgerRevenue.grossCents : revenueCents,
    refundsCents: ledgerRevenue ? ledgerRevenue.refundsCents : 0,
    discountsCents: ledgerRevenue ? ledgerRevenue.discountsCents : 0,
    revenueSource: ledgerRevenue ? "ledger" : "installments",
    expensesByCategory: Array.from(expensesByCategory.entries()).map(([category, amountCents]) => ({ category, amountCents })),
    monthly: Array.from(monthly.entries())
      .map(([month, v]) => ({ month, ...v, netCents: v.revenueCents - v.expensesCents }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  });
});

// ─── STUDENT PAYMENT STATUS ─────────────────────────────────────────────────
// Every student's balance, computed from their tuition plans plus the
// tuition ledger (lib/tuitionBalances.ts). Returns the same fields as before
// (totalOwedCents, totalPaidCents, balanceCents, paymentStatus, ...) plus the
// ledger ones; GET /accounting/balances adds filters, counts and facets.
router.get("/accounting/students", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const { status } = req.query as { status?: "paid" | "partial" | "owing" };
  try {
    const { rows } = await buildBalanceRows(req.schoolId ?? "", {});
    res.json(status ? rows.filter((r) => r.paymentStatus === status) : rows);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load balances" });
  }
});

// ─── SEND PAYMENT REMINDER ───────────────────────────────────────────────────
// One student's balance reminder: the same message, channels, preferences
// and 24h throttle as the bulk POST /accounting/reminders/send
// (lib/tuitionReminders.ts). Body: { note?, notifyParents?, override? }.
router.post("/accounting/students/:studentId/remind", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;
  const body = (req.body ?? {}) as { message?: string; note?: string; notifyParents?: boolean; override?: boolean };

  const { data: student } = await supabaseAdmin.from("profiles").select("id, school_id").eq("id", studentId).maybeSingle();
  if (!student || student.school_id !== req.schoolId) {
    res.status(404).json({ error: "Student not found in your school" });
    return;
  }

  try {
    const summary = await sendReminders({
      schoolId: req.schoolId as string,
      sentBy: req.userId ?? null,
      studentIds: [studentId],
      note: body.note ?? body.message,
      notifyParents: body.notifyParents === true,
      override: body.override === true,
    });
    if (summary.skippedNoBalance) {
      res.status(400).json({ error: "This student has no outstanding balance.", ...summary });
      return;
    }
    if (summary.skippedRecent) {
      res.status(409).json({ error: "This student was reminded in the last 24 hours. Send again anyway to override.", code: "throttled", ...summary });
      return;
    }
    res.status(summary.sent ? 201 : 502).json({ ...summary, sentAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to send reminder" });
  }
});

// ─── CSV EXPORTS ─────────────────────────────────────────────────────────────
function toCsv(rows: (string | number | null)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = cell === null || cell === undefined ? "" : String(cell);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    )
    .join("\n");
}

// Every ledger entry (payments, discounts, waivers, adjustments, refunds,
// including voided ones, marked as such), optionally within ?from=&to=, so
// the file reconciles with the P&L. Before tuition-ledger.sql is run it falls
// back to the old one-row-per-plan export below.
router.get("/accounting/export/payments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const schoolId = req.schoolId ?? "";
  const q = req.query as { from?: string; to?: string };

  const ledger = await ledgerEntriesInRange(schoolId, q.from || "1900-01-01", q.to || "2999-12-31").catch(() => null);
  if (ledger) {
    const names = await profileNames([...ledger.map((e) => e.student_id), ...ledger.map((e) => e.recorded_by ?? "")]);
    const ids = Array.from(new Set(ledger.map((e) => e.student_id)));
    const { data: emails } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, email").in("id", ids)
      : { data: [] as Record<string, unknown>[] };
    const emailById = new Map((emails ?? []).map((p) => [p.id, p.email as string]));
    const out: (string | number | null)[][] = [[
      "Date Received", "Receipt", "Student Name", "Student Email", "Type", "Label", "Method", "Reference", "Currency",
      "Amount", "Signed Amount", "Status", "Void Reason", "Note", "Recorded By", "Recorded At", "Source", "Entry ID", "Plan ID", "Installment ID",
    ]];
    for (const e of ledger) {
      const signed = e.kind === "refund" ? -Math.abs(e.amount_cents) : e.kind === "adjustment" ? e.amount_cents : Math.abs(e.amount_cents);
      out.push([
        e.paid_on, e.receipt_number ?? "", names.get(e.student_id) ?? "Unknown", emailById.get(e.student_id) ?? "", e.kind, e.label ?? "",
        e.method ? METHOD_LABEL[e.method as PaymentMethod] ?? e.method : "", e.reference ?? "", (e.currency || "usd").toUpperCase(),
        (Math.abs(e.amount_cents) / 100).toFixed(2), (signed / 100).toFixed(2), e.voided_at ? "void" : "active", e.void_reason ?? "", e.note ?? "",
        e.recorded_by ? names.get(e.recorded_by) ?? "" : "", e.recorded_at, e.source, e.id, e.payment_id ?? "", e.installment_id ?? "",
      ]);
    }
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="tuition-ledger-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(out.map((r) => r.map(toCsvCell).join(",")).join("\n"));
    return;
  }

  const { data: payments, error } = await supabaseAdmin
    .from("tuition_payments")
    .select("id, student_id, amount_cents, status, payment_method, created_at")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const studentIds = Array.from(new Set((payments ?? []).map((p) => p.student_id as string)));
  const { data: profiles } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", studentIds)
    : { data: [] as Record<string, unknown>[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: (string | number | null)[][] = [["Student Name", "Student Email", "Amount", "Status", "Method", "Date"]];
  for (const p of payments ?? []) {
    const profile = profileById.get(p.student_id as string) as Record<string, unknown> | undefined;
    rows.push([
      profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "Unknown",
      (profile?.email as string) ?? "",
      ((p.amount_cents as number) / 100).toFixed(2),
      p.status as string,
      p.payment_method as string,
      p.created_at as string,
    ]);
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="tuition-payments-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(toCsv(rows));
});

router.get("/accounting/export/expenses", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const { from, to } = parseRange(req);

  const { data, error } = await supabaseAdmin
    .from("expenses")
    .select("category, description, amount_cents, expense_date")
    .eq("school_id", req.schoolId ?? "")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const rows: (string | number | null)[][] = [["Category", "Description", "Amount", "Date"]];
  for (const e of data ?? []) {
    rows.push([e.category as string, e.description as string, ((e.amount_cents as number) / 100).toFixed(2), e.expense_date as string]);
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="expenses-${from}-to-${to}.csv"`);
  res.send(toCsv(rows));
});

export default router;
