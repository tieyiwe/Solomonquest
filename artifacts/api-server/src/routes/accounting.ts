import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { requireSchoolFeature } from "../lib/featureFlags";

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
  const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().slice(0, 10);
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

  const revenueCents = (paidInstallmentsRes.data ?? []).reduce((sum, r) => sum + ((r as Record<string, unknown>).amount_cents as number), 0);
  const expensesCents = (expensesRes.data ?? []).reduce((sum, r) => sum + (r.amount_cents as number), 0);

  const expensesByCategory = new Map<string, number>();
  for (const e of expensesRes.data ?? []) {
    const key = (e.category as string) || "other";
    expensesByCategory.set(key, (expensesByCategory.get(key) ?? 0) + (e.amount_cents as number));
  }

  // Monthly breakdown for a simple trend chart.
  const monthly = new Map<string, { revenueCents: number; expensesCents: number }>();
  for (const r of paidInstallmentsRes.data ?? []) {
    const paidAt = (r as Record<string, unknown>).paid_at as string;
    const key = paidAt.slice(0, 7);
    const entry = monthly.get(key) ?? { revenueCents: 0, expensesCents: 0 };
    entry.revenueCents += (r as Record<string, unknown>).amount_cents as number;
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
    expensesByCategory: Array.from(expensesByCategory.entries()).map(([category, amountCents]) => ({ category, amountCents })),
    monthly: Array.from(monthly.entries())
      .map(([month, v]) => ({ month, ...v, netCents: v.revenueCents - v.expensesCents }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  });
});

// ─── STUDENT PAYMENT STATUS ─────────────────────────────────────────────────
// Aggregates every student's tuition_payments into a single balance view so
// admins can filter who's paid in full vs who still owes, without manually
// cross-referencing installments per payment.
router.get("/accounting/students", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const schoolId = req.schoolId ?? "";
  const { status } = req.query as { status?: "paid" | "partial" | "owing" };

  const { data: payments, error } = await supabaseAdmin
    .from("tuition_payments")
    .select("id, student_id, amount_cents, status, created_at, course_id, program_id")
    .eq("school_id", schoolId);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const paymentIds = (payments ?? []).map((p) => p.id as string);
  const { data: installments } = paymentIds.length
    ? await supabaseAdmin
        .from("tuition_installments")
        .select("payment_id, amount_cents, status, due_date, paid_at")
        .in("payment_id", paymentIds)
    : { data: [] as Record<string, unknown>[] };

  const paidByPayment = new Map<string, number>();
  const lastPaidAtByPayment = new Map<string, string>();
  const nextDueByPayment = new Map<string, string>();
  for (const i of installments ?? []) {
    const pid = i.payment_id as string;
    if (i.status === "paid") {
      paidByPayment.set(pid, (paidByPayment.get(pid) ?? 0) + (i.amount_cents as number));
      const paidAt = i.paid_at as string | null;
      if (paidAt && (!lastPaidAtByPayment.has(pid) || paidAt > lastPaidAtByPayment.get(pid)!)) {
        lastPaidAtByPayment.set(pid, paidAt);
      }
    } else if (!nextDueByPayment.has(pid)) {
      nextDueByPayment.set(pid, i.due_date as string);
    }
  }

  type StudentAgg = {
    studentId: string;
    totalOwedCents: number;
    totalPaidCents: number;
    lastPaymentAt: string | null;
    nextDueDate: string | null;
    paymentCount: number;
  };
  const byStudent = new Map<string, StudentAgg>();
  for (const p of payments ?? []) {
    const sid = p.student_id as string;
    const agg = byStudent.get(sid) ?? { studentId: sid, totalOwedCents: 0, totalPaidCents: 0, lastPaymentAt: null, nextDueDate: null, paymentCount: 0 };
    agg.totalOwedCents += p.amount_cents as number;
    agg.totalPaidCents += paidByPayment.get(p.id as string) ?? 0;
    agg.paymentCount += 1;
    const lastPaid = lastPaidAtByPayment.get(p.id as string);
    if (lastPaid && (!agg.lastPaymentAt || lastPaid > agg.lastPaymentAt)) agg.lastPaymentAt = lastPaid;
    const nextDue = nextDueByPayment.get(p.id as string);
    if (nextDue && (!agg.nextDueDate || nextDue < agg.nextDueDate)) agg.nextDueDate = nextDue;
    byStudent.set(sid, agg);
  }

  const studentIds = Array.from(byStudent.keys());
  const { data: profiles } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name, email").in("id", studentIds)
    : { data: [] as Record<string, unknown>[] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  let rows = Array.from(byStudent.values()).map((agg) => {
    const profile = profileById.get(agg.studentId) as Record<string, unknown> | undefined;
    const balanceCents = agg.totalOwedCents - agg.totalPaidCents;
    const paymentStatus: "paid" | "partial" | "owing" = balanceCents <= 0 ? "paid" : agg.totalPaidCents > 0 ? "partial" : "owing";
    return {
      studentId: agg.studentId,
      studentName: profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Unknown" : "Unknown",
      studentEmail: (profile?.email as string) ?? null,
      totalOwedCents: agg.totalOwedCents,
      totalPaidCents: agg.totalPaidCents,
      balanceCents,
      paymentStatus,
      lastPaymentAt: agg.lastPaymentAt,
      nextDueDate: agg.nextDueDate,
      paymentCount: agg.paymentCount,
    };
  });

  if (status) rows = rows.filter((r) => r.paymentStatus === status);
  rows.sort((a, b) => b.balanceCents - a.balanceCents);

  res.json(rows);
});

// ─── SEND PAYMENT REMINDER ───────────────────────────────────────────────────
// Inserts directly into the existing reminders table (same one used by
// admin/teacher reminders) with send_at = now, so it's an immediate
// balance-due nudge rather than a scheduled future one.
router.post("/accounting/students/:studentId/remind", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const studentId = Array.isArray(req.params.studentId) ? req.params.studentId[0] : req.params.studentId;
  const { message } = req.body as { message?: string };

  const { data: student } = await supabaseAdmin.from("profiles").select("id, school_id").eq("id", studentId).maybeSingle();
  if (!student || student.school_id !== req.schoolId) {
    res.status(404).json({ error: "Student not found in your school" });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("reminders")
    .insert({
      school_id: req.schoolId,
      created_by: req.userId,
      target_user_id: studentId,
      target_role: null,
      course_id: null,
      message: message?.trim() || "You have an outstanding tuition balance. Please log in to view and complete your payment.",
      send_at: new Date().toISOString(),
      type: "admin_to_teacher",
    })
    .select()
    .single();

  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to send reminder" });
    return;
  }

  // A reminders row alone never actually reaches the student: the calendar
  // feed only shows non-admins reminders matched on target_role + an
  // enrolled course_id, and this one has neither. Raise a real notification
  // so the nudge lands in the student's bell, which is what this button
  // promises.
  const { error: notifyError } = await supabaseAdmin.from("notifications").insert({
    user_id: studentId,
    type: "tuition_reminder",
    title: "Tuition balance due",
    body: data.message as string,
    is_read: false,
    metadata: {},
  });
  if (notifyError) {
    // The reminder itself was recorded; a failed bell notification should
    // not turn the whole request into an error.
    // eslint-disable-next-line no-console
    console.error("[accounting] Failed to create tuition reminder notification:", notifyError.message);
  }

  res.status(201).json({ id: data.id, sentAt: data.send_at });
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

router.get("/accounting/export/payments", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!requireAccountingAccess(req, res)) return;
  const schoolId = req.schoolId ?? "";

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
