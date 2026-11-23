import { Router, type IRouter, type Response } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { QUESTION_TYPES } from "../lib/questionBanks";
import { assertCanManageQuiz } from "./quizzes";

// ---------------------------------------------------------------------------
// Question banks. Teachers/admins only — students never reach these routes,
// and nothing here is ever sent to a student (drawn questions go out through
// POST /quizzes/:id/attempts, answer keys stripped).
//
// Access:
//   admin        every bank in their school (view + edit)
//   teacher      shared school banks (course_id null): view/use; edit own
//                course banks: only for courses they teach (view + edit)
//   super_admin  everything
// ---------------------------------------------------------------------------

const router: IRouter = Router();

const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");
const isStaffRole = (r?: string) => r === "teacher" || r === "admin" || r === "super_admin";

interface BankRow {
  id: string;
  school_id: string;
  course_id: string | null;
  name: string;
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

type BankAccess = { ok: true; bank: BankRow; canEdit: boolean } | { ok: false; status: number; error: string };

async function bankAccess(bankId: string, req: AuthenticatedRequest): Promise<BankAccess> {
  const { data: bank } = await supabaseAdmin.from("question_banks").select("*").eq("id", bankId).maybeSingle();
  if (!bank) return { ok: false, status: 404, error: "Question bank not found" };
  const b = bank as BankRow;
  if (req.userRole === "super_admin") return { ok: true, bank: b, canEdit: true };
  if (!req.schoolId || b.school_id !== req.schoolId) return { ok: false, status: 404, error: "Question bank not found" };
  if (req.userRole === "admin") return { ok: true, bank: b, canEdit: true };
  if (req.userRole === "teacher") {
    if (!b.course_id) return { ok: true, bank: b, canEdit: b.created_by === req.userId };
    const { data: course } = await supabaseAdmin.from("courses").select("teacher_id").eq("id", b.course_id).maybeSingle();
    if (course?.teacher_id === req.userId) return { ok: true, bank: b, canEdit: true };
  }
  return { ok: false, status: 404, error: "Question bank not found" };
}

function deny(res: Response, a: { status: number; error: string }) {
  res.status(a.status).json({ error: a.error });
}

function mapBank(b: BankRow, extra: { questionCount?: number; tags?: string[]; courseTitle?: string | null; canEdit?: boolean } = {}) {
  return {
    id: b.id,
    schoolId: b.school_id,
    courseId: b.course_id,
    courseTitle: extra.courseTitle ?? null,
    name: b.name,
    description: b.description,
    createdBy: b.created_by,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    questionCount: extra.questionCount ?? 0,
    tags: extra.tags ?? [],
    canEdit: extra.canEdit ?? false,
  };
}

function mapQuestion(q: Record<string, unknown>) {
  return {
    id: q.id as string,
    bankId: q.bank_id as string,
    type: q.type as string,
    question: (q.question as string) ?? "",
    options: q.options ?? null,
    correctAnswer: q.correct_answer ?? null,
    points: Number(q.points ?? 1),
    tags: Array.isArray(q.tags) ? (q.tags as string[]) : [],
    createdAt: q.created_at as string,
    updatedAt: q.updated_at as string,
  };
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const t of raw) {
    const v = String(t ?? "").trim().toLowerCase().slice(0, 40);
    if (v) out.add(v);
    if (out.size >= 20) break;
  }
  return Array.from(out);
}

function cleanOptions(raw: unknown): { id: string; text: string; is_correct: boolean }[] | null {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, 20).map((o, i) => {
    const r = (o && typeof o === "object" ? o : {}) as Record<string, unknown>;
    return {
      id: String(r.id ?? i).slice(0, 64),
      text: String(r.text ?? "").slice(0, 2000),
      is_correct: r.is_correct === true || r.isCorrect === true,
    };
  });
}

/** Validates a question payload ({ type, question, options, correctAnswer, points, tags }). */
function questionFields(body: Record<string, unknown>, partial: boolean): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  const fields: Record<string, unknown> = {};
  if (!partial || body.type !== undefined) {
    if (!QUESTION_TYPES.has(String(body.type))) return { ok: false, error: "Unsupported question type" };
    fields.type = String(body.type);
  }
  if (!partial || body.question !== undefined) fields.question = String(body.question ?? "").slice(0, 5000);
  if (!partial || body.options !== undefined) fields.options = cleanOptions(body.options);
  const ca = body.correctAnswer !== undefined ? body.correctAnswer : body.correct_answer;
  if (!partial || ca !== undefined) fields.correct_answer = ca === undefined || ca === "" ? null : ca;
  if (!partial || body.points !== undefined) {
    const pts = Number(body.points ?? 1);
    if (!Number.isFinite(pts) || pts < 0 || pts > 1000) return { ok: false, error: "Points must be between 0 and 1000" };
    fields.points = Math.round(pts);
  }
  if (!partial || body.tags !== undefined) fields.tags = cleanTags(body.tags);
  return { ok: true, fields };
}

// ─── Banks ──────────────────────────────────────────────────────────────────

router.get("/question-banks", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isStaffRole(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  if (!req.schoolId && req.userRole !== "super_admin") { res.json([]); return; }
  try {
    let query = supabaseAdmin.from("question_banks").select("*").order("name", { ascending: true });
    if (req.schoolId) query = query.eq("school_id", req.schoolId);
    const courseFilter = typeof req.query.courseId === "string" ? req.query.courseId : "";
    const { data: banks, error } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }

    let taught = new Set<string>();
    if (req.userRole === "teacher") {
      const { data: myCourses } = await supabaseAdmin.from("courses").select("id").eq("teacher_id", req.userId ?? "");
      taught = new Set((myCourses ?? []).map((c) => c.id as string));
    }
    const visible = ((banks ?? []) as BankRow[]).filter((b) => {
      if (req.userRole === "teacher" && b.course_id && !taught.has(b.course_id)) return false;
      // ?courseId= → that course's banks plus shared ones (what a quiz on that course may use)
      if (courseFilter && b.course_id && b.course_id !== courseFilter) return false;
      return true;
    });

    const ids = visible.map((b) => b.id);
    const courseIds = Array.from(new Set(visible.map((b) => b.course_id).filter((x): x is string => !!x)));
    const [qRes, cRes] = await Promise.all([
      ids.length ? supabaseAdmin.from("question_bank_questions").select("bank_id, tags").in("bank_id", ids) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      courseIds.length ? supabaseAdmin.from("courses").select("id, title").in("id", courseIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ]);
    const counts = new Map<string, number>();
    const tags = new Map<string, Set<string>>();
    for (const q of (qRes.data ?? []) as Record<string, unknown>[]) {
      const bid = q.bank_id as string;
      counts.set(bid, (counts.get(bid) ?? 0) + 1);
      if (!tags.has(bid)) tags.set(bid, new Set());
      for (const t of (q.tags as string[] | null) ?? []) tags.get(bid)!.add(t);
    }
    const titles = new Map(((cRes.data ?? []) as Record<string, unknown>[]).map((c) => [c.id as string, c.title as string]));
    res.json(
      visible.map((b) =>
        mapBank(b, {
          questionCount: counts.get(b.id) ?? 0,
          tags: Array.from(tags.get(b.id) ?? []).sort(),
          courseTitle: b.course_id ? titles.get(b.course_id) ?? null : null,
          canEdit:
            req.userRole === "admin" || req.userRole === "super_admin" ||
            (b.course_id ? taught.has(b.course_id) : b.created_by === req.userId),
        })
      )
    );
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to load question banks" });
  }
});

router.post("/question-banks", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  if (!isStaffRole(req.userRole)) { res.status(403).json({ error: "Forbidden" }); return; }
  const { name, description, courseId } = (req.body ?? {}) as { name?: string; description?: string; courseId?: string | null };
  const trimmed = String(name ?? "").trim();
  if (!trimmed || trimmed.length > 120) { res.status(400).json({ error: "Name is required (max 120 characters)" }); return; }

  let schoolId = req.schoolId ?? null;
  if (courseId) {
    const { data: course } = await supabaseAdmin.from("courses").select("school_id, teacher_id").eq("id", courseId).maybeSingle();
    if (!course) { res.status(404).json({ error: "Course not found" }); return; }
    if (req.userRole === "teacher" && course.teacher_id !== req.userId) { res.status(403).json({ error: "You do not teach this course" }); return; }
    if (req.userRole === "admin" && course.school_id !== req.schoolId) { res.status(404).json({ error: "Course not found" }); return; }
    schoolId = course.school_id as string;
  }
  if (!schoolId) { res.status(400).json({ error: "No school associated with this account" }); return; }

  const { data, error } = await supabaseAdmin
    .from("question_banks")
    .insert({
      school_id: schoolId,
      course_id: courseId || null,
      name: trimmed,
      description: String(description ?? "").trim().slice(0, 1000) || null,
      created_by: req.userId ?? null,
    })
    .select()
    .single();
  if (error || !data) { res.status(500).json({ error: error?.message ?? "Failed to create bank" }); return; }
  res.status(201).json(mapBank(data as BankRow, { canEdit: true }));
});

router.patch("/question-banks/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  if (!a.canEdit) { res.status(403).json({ error: "You can't edit this bank" }); return; }
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (req.body?.name !== undefined) {
    const n = String(req.body.name).trim();
    if (!n || n.length > 120) { res.status(400).json({ error: "Name is required (max 120 characters)" }); return; }
    updates.name = n;
  }
  if (req.body?.description !== undefined) updates.description = String(req.body.description ?? "").trim().slice(0, 1000) || null;
  const { data, error } = await supabaseAdmin.from("question_banks").update(updates).eq("id", a.bank.id).select().single();
  if (error || !data) { res.status(500).json({ error: error?.message ?? "Failed to update bank" }); return; }
  res.json(mapBank(data as BankRow, { canEdit: true }));
});

router.delete("/question-banks/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  if (!a.canEdit) { res.status(403).json({ error: "You can't delete this bank" }); return; }
  const { error } = await supabaseAdmin.from("question_banks").delete().eq("id", a.bank.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.sendStatus(204);
});

router.get("/question-banks/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  let q = supabaseAdmin.from("question_bank_questions").select("*").eq("bank_id", a.bank.id).order("created_at", { ascending: true });
  const tag = typeof req.query.tag === "string" ? req.query.tag.trim().toLowerCase() : "";
  if (tag) q = q.contains("tags", [tag]);
  const { data: questions, error } = await q;
  if (error) { res.status(500).json({ error: error.message }); return; }
  let courseTitle: string | null = null;
  if (a.bank.course_id) {
    const { data: c } = await supabaseAdmin.from("courses").select("title").eq("id", a.bank.course_id).maybeSingle();
    courseTitle = (c?.title as string | null) ?? null;
  }
  const qs = (questions ?? []) as Record<string, unknown>[];
  const allTags = new Set<string>();
  qs.forEach((x) => ((x.tags as string[] | null) ?? []).forEach((t) => allTags.add(t)));
  res.json({
    ...mapBank(a.bank, { questionCount: qs.length, tags: Array.from(allTags).sort(), courseTitle, canEdit: a.canEdit }),
    questions: qs.map(mapQuestion),
  });
});

// ─── Bank questions ─────────────────────────────────────────────────────────

router.post("/question-banks/:id/questions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  if (!a.canEdit) { res.status(403).json({ error: "You can't edit this bank" }); return; }
  const v = questionFields((req.body ?? {}) as Record<string, unknown>, false);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  const { data, error } = await supabaseAdmin
    .from("question_bank_questions")
    .insert({ ...v.fields, bank_id: a.bank.id, created_by: req.userId ?? null })
    .select()
    .single();
  if (error || !data) { res.status(500).json({ error: error?.message ?? "Failed to add question" }); return; }
  res.status(201).json(mapQuestion(data));
});

router.put("/question-banks/:id/questions/:qid", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  if (!a.canEdit) { res.status(403).json({ error: "You can't edit this bank" }); return; }
  const v = questionFields((req.body ?? {}) as Record<string, unknown>, true);
  if (!v.ok) { res.status(400).json({ error: v.error }); return; }
  const { data, error } = await supabaseAdmin
    .from("question_bank_questions")
    .update({ ...v.fields, updated_at: new Date().toISOString() })
    .eq("id", one(req.params.qid))
    .eq("bank_id", a.bank.id)
    .select()
    .maybeSingle();
  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data) { res.status(404).json({ error: "Question not found" }); return; }
  res.json(mapQuestion(data));
});

router.delete("/question-banks/:id/questions/:qid", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  if (!a.canEdit) { res.status(403).json({ error: "You can't edit this bank" }); return; }
  const { error } = await supabaseAdmin
    .from("question_bank_questions")
    .delete()
    .eq("id", one(req.params.qid))
    .eq("bank_id", a.bank.id);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.sendStatus(204);
});

// Import questions from an existing quiz into a bank (copies them).
router.post("/question-banks/:id/import-quiz", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const a = await bankAccess(one(req.params.id), req);
  if (!a.ok) return deny(res, a);
  if (!a.canEdit) { res.status(403).json({ error: "You can't edit this bank" }); return; }
  const { quizId, questionIds, tags } = (req.body ?? {}) as { quizId?: string; questionIds?: string[]; tags?: string[] };
  if (!quizId) { res.status(400).json({ error: "quizId is required" }); return; }

  const quizAccess = await assertCanManageQuiz(quizId, req.userId, req.userRole);
  if (!quizAccess.ok) { res.status(quizAccess.status).json({ error: quizAccess.error }); return; }
  const { data: course } = await supabaseAdmin.from("courses").select("school_id").eq("id", quizAccess.courseId).maybeSingle();
  if (course?.school_id !== a.bank.school_id) { res.status(400).json({ error: "That quiz belongs to a different school" }); return; }

  let q = supabaseAdmin.from("quiz_questions").select("*").eq("quiz_id", quizId).order("order_index", { ascending: true });
  if (Array.isArray(questionIds) && questionIds.length > 0) q = q.in("id", questionIds.slice(0, 500));
  const { data: src, error } = await q;
  if (error) { res.status(500).json({ error: error.message }); return; }
  const extraTags = cleanTags(tags);
  const rows = (src ?? [])
    .map((r) => ({
      bank_id: a.bank.id,
      type: (r.type ?? r.question_type ?? "short_answer") as string,
      question: (r.question ?? r.question_text ?? "") as string,
      options: r.options ?? null,
      correct_answer: r.correct_answer ?? null,
      points: Number(r.points ?? 1),
      tags: extraTags,
      source_quiz_question_id: r.id,
      created_by: req.userId ?? null,
    }))
    .filter((r) => QUESTION_TYPES.has(r.type));
  if (rows.length === 0) { res.json({ imported: 0 }); return; }
  const { error: insErr } = await supabaseAdmin.from("question_bank_questions").insert(rows);
  if (insErr) { res.status(500).json({ error: insErr.message }); return; }
  res.status(201).json({ imported: rows.length });
});

// ─── Quiz side: add from bank, random-draw rules ────────────────────────────

/** Quiz manager + bank usable for that quiz (same school, visible to caller). */
async function quizAndBank(req: AuthenticatedRequest, quizId: string, bankId: string) {
  const quizAccess = await assertCanManageQuiz(quizId, req.userId, req.userRole);
  if (!quizAccess.ok) return quizAccess;
  const a = await bankAccess(bankId, req);
  if (!a.ok) return a;
  const { data: course } = await supabaseAdmin.from("courses").select("school_id").eq("id", quizAccess.courseId).maybeSingle();
  if (course?.school_id !== a.bank.school_id) return { ok: false as const, status: 400, error: "That bank belongs to a different school" };
  if (a.bank.course_id && a.bank.course_id !== quizAccess.courseId) {
    return { ok: false as const, status: 400, error: "That bank belongs to a different course" };
  }
  return { ok: true as const, courseId: quizAccess.courseId, bank: a.bank };
}

// Copies the picked bank questions into the quiz as ordinary quiz questions.
router.post("/quizzes/:id/bank-questions", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const quizId = one(req.params.id);
  const { bankId, questionIds } = (req.body ?? {}) as { bankId?: string; questionIds?: string[] };
  if (!bankId || !Array.isArray(questionIds) || questionIds.length === 0) {
    res.status(400).json({ error: "bankId and questionIds are required" });
    return;
  }
  const ctx = await quizAndBank(req, quizId, bankId);
  if (!ctx.ok) { res.status(ctx.status).json({ error: ctx.error }); return; }

  const { data: picked } = await supabaseAdmin
    .from("question_bank_questions")
    .select("*")
    .eq("bank_id", bankId)
    .in("id", questionIds.slice(0, 200));
  const order = new Map(questionIds.map((id, i) => [id, i]));
  const sorted = (picked ?? []).sort((x, y) => (order.get(x.id as string) ?? 0) - (order.get(y.id as string) ?? 0));
  if (sorted.length === 0) { res.status(404).json({ error: "No matching questions in that bank" }); return; }

  const { data: last } = await supabaseAdmin
    .from("quiz_questions")
    .select("order_index")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const start = ((last?.order_index as number | null) ?? -1) + 1;
  const rows = sorted.map((q, i) => ({
    quiz_id: quizId,
    type: q.type,
    question: q.question,
    options: q.options ?? null,
    correct_answer: q.correct_answer ?? null,
    points: q.points ?? 1,
    order_index: start + i,
  }));
  const { data: inserted, error } = await supabaseAdmin.from("quiz_questions").insert(rows).select();
  if (error) { res.status(500).json({ error: error.message }); return; }
  // Same raw row shape as GET /quizzes/:id questions (the builder maps it).
  res.status(201).json(inserted ?? []);
});

router.get("/quizzes/:id/draws", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const quizId = one(req.params.id);
  const quizAccess = await assertCanManageQuiz(quizId, req.userId, req.userRole);
  if (!quizAccess.ok) { res.status(quizAccess.status).json({ error: quizAccess.error }); return; }
  const { data, error } = await supabaseAdmin
    .from("quiz_bank_draws")
    .select("id, bank_id, draw_count, tag, created_at, question_banks:bank_id (name)")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(
    (data ?? []).map((d) => {
      const bank = d.question_banks as unknown as { name: string } | { name: string }[] | null;
      return {
        id: d.id,
        bankId: d.bank_id,
        bankName: (Array.isArray(bank) ? bank[0]?.name : bank?.name) ?? "",
        count: d.draw_count,
        tag: d.tag ?? null,
        createdAt: d.created_at,
      };
    })
  );
});

router.post("/quizzes/:id/draws", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const quizId = one(req.params.id);
  const { bankId, count, tag } = (req.body ?? {}) as { bankId?: string; count?: number; tag?: string | null };
  const n = Number(count);
  if (!bankId || !Number.isInteger(n) || n < 1 || n > 100) {
    res.status(400).json({ error: "bankId and a count between 1 and 100 are required" });
    return;
  }
  const ctx = await quizAndBank(req, quizId, bankId);
  if (!ctx.ok) { res.status(ctx.status).json({ error: ctx.error }); return; }
  const cleanTag = tag ? String(tag).trim().toLowerCase().slice(0, 40) || null : null;
  const { data, error } = await supabaseAdmin
    .from("quiz_bank_draws")
    .insert({ quiz_id: quizId, bank_id: bankId, draw_count: n, tag: cleanTag, created_by: req.userId ?? null })
    .select()
    .single();
  if (error || !data) { res.status(500).json({ error: error?.message ?? "Failed to add draw" }); return; }
  res.status(201).json({ id: data.id, bankId, bankName: ctx.bank.name, count: n, tag: cleanTag, createdAt: data.created_at });
});

router.delete("/quizzes/:id/draws/:drawId", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const quizId = one(req.params.id);
  const quizAccess = await assertCanManageQuiz(quizId, req.userId, req.userRole);
  if (!quizAccess.ok) { res.status(quizAccess.status).json({ error: quizAccess.error }); return; }
  const { error } = await supabaseAdmin.from("quiz_bank_draws").delete().eq("id", one(req.params.drawId)).eq("quiz_id", quizId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.sendStatus(204);
});

export default router;
