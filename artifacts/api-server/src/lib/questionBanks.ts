import { randomInt } from "crypto";
import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";

export const QUESTION_TYPES = new Set(["multiple_choice", "true_false", "short_answer", "essay", "fill_blank"]);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Resolves a quiz's random-draw rules into concrete bank question ids for one
 * attempt. Called server-side when the attempt starts; the result is stored
 * on quiz_attempts.drawn_question_ids so grading uses exactly these. A rule
 * whose bank has fewer matching questions than requested draws all of them.
 * Returns [] when the quiz has no rules (or question-banks.sql isn't applied).
 */
export async function drawQuestionsForQuiz(quizId: string): Promise<string[]> {
  const { data: rules, error } = await supabaseAdmin
    .from("quiz_bank_draws")
    .select("id, bank_id, draw_count, tag")
    .eq("quiz_id", quizId)
    .order("created_at", { ascending: true });
  if (error) {
    // Table missing before the migration is run: behave like "no draws".
    if (!/does not exist|schema cache/i.test(error.message)) logger.warn({ err: error }, "[questionBanks] draw rules lookup failed");
    return [];
  }
  const chosen: string[] = [];
  const seen = new Set<string>();
  for (const rule of rules ?? []) {
    let q = supabaseAdmin.from("question_bank_questions").select("id").eq("bank_id", rule.bank_id as string);
    if (rule.tag) q = q.contains("tags", [rule.tag as string]);
    const { data: pool } = await q.limit(5000);
    const candidates = (pool ?? []).map((r) => r.id as string).filter((id) => !seen.has(id));
    for (const id of shuffle(candidates).slice(0, Math.max(0, Number(rule.draw_count) || 0))) {
      seen.add(id);
      chosen.push(id);
    }
  }
  return chosen;
}

/**
 * Loads bank questions in the same row shape as quiz_questions, so the
 * existing grading and student-sanitizing code can treat them identically.
 * Keeps the given id order.
 */
export async function loadBankQuestionsAsQuizRows(ids: string[], quizId: string): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("question_bank_questions")
    .select("id, type, question, options, correct_answer, points")
    .in("id", ids);
  const byId = new Map((data ?? []).map((r) => [r.id as string, r]));
  return ids
    .map((id, i) => {
      const r = byId.get(id);
      if (!r) return null;
      return {
        id: r.id,
        quiz_id: quizId,
        type: r.type,
        question: r.question,
        options: r.options ?? null,
        correct_answer: r.correct_answer ?? null,
        points: r.points ?? 1,
        order_index: 100000 + i,
        from_bank: true,
      } as Record<string, unknown>;
    })
    .filter((r): r is Record<string, unknown> => r !== null);
}

/** Reads quiz_attempts.drawn_question_ids defensively (jsonb array of ids). */
export function drawnIdsOf(attempt: Record<string, unknown>): string[] {
  const raw = attempt.drawn_question_ids;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}
