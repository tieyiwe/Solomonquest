import { supabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// gradeSubmission — the one correct path for setting a submission's grade.
//
// Previously two separate routes did this (submissions.ts's PATCH, which
// the gradebook UI actually calls but never wrote to `transcripts`, and
// grading.ts's PUT, which did write transcripts but referenced columns
// that don't exist — assignments.school_id, assignments.max_grade — and
// was effectively dead/broken). This is now the single implementation
// both routes call, so a grade always: updates the submission, upserts
// the corresponding transcript row, and notifies the student.
// ---------------------------------------------------------------------------

export interface GradeSubmissionParams {
  submissionId: string;
  grade?: number;
  rubricScores?: Record<string, number>;
  feedback?: string | null;
  gradedBy: string | undefined;
}

export type GradeSubmissionResult =
  | { ok: true; submission: Record<string, unknown> }
  | { ok: false; status: number; error: string };

export async function gradeSubmission(params: GradeSubmissionParams): Promise<GradeSubmissionResult> {
  const { submissionId, grade, rubricScores, feedback, gradedBy } = params;

  if ((grade === undefined || grade === null) && !rubricScores) {
    return { ok: false, status: 400, error: "grade (or rubricScores) is required" };
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("submissions")
    .select("id, student_id, assignment_id, assignments:assignment_id (id, title, course_id, points_possible, rubric, courses:course_id (id, school_id))")
    .eq("id", submissionId)
    .single();

  if (fetchError || !existing) {
    return { ok: false, status: 404, error: "Submission not found" };
  }

  const assignment = existing.assignments as unknown as {
    id: string;
    title: string;
    course_id: string | null;
    points_possible: number | null;
    rubric: { id: string; name: string; maxPoints: number }[] | null;
    courses: { id: string; school_id: string | null } | null;
  } | null;

  const updates: Record<string, unknown> = {
    status: "graded",
    graded_by: gradedBy ?? null,
    graded_at: new Date().toISOString(),
  };
  if (feedback !== undefined) updates.feedback = feedback;

  let finalGrade: number;

  if (rubricScores) {
    const rubric = assignment?.rubric ?? null;
    if (!rubric || rubric.length === 0) {
      return { ok: false, status: 400, error: "This assignment has no rubric to grade against" };
    }

    let total = 0;
    const validatedScores: Record<string, { score: number }> = {};
    for (const criterion of rubric) {
      const raw = rubricScores[criterion.id];
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0 || raw > criterion.maxPoints) {
        return {
          ok: false,
          status: 400,
          error: `Score for "${criterion.name}" must be between 0 and ${criterion.maxPoints}`,
        };
      }
      validatedScores[criterion.id] = { score: raw };
      total += raw;
    }

    updates.rubric_scores = validatedScores;
    updates.grade = total;
    finalGrade = total;
  } else {
    const pointsPossible = assignment?.points_possible;
    if (
      typeof grade !== "number" ||
      !Number.isFinite(grade) ||
      grade < 0 ||
      (typeof pointsPossible === "number" && grade > pointsPossible)
    ) {
      const bound = typeof pointsPossible === "number" ? ` and ${pointsPossible}` : "";
      return { ok: false, status: 400, error: `Grade must be a number between 0${bound}` };
    }
    updates.grade = grade;
    updates.rubric_scores = null;
    finalGrade = grade;
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("submissions")
    .update(updates)
    .eq("id", submissionId)
    .select()
    .single();

  if (updateError || !updated) {
    return { ok: false, status: 500, error: updateError?.message ?? "Failed to update submission" };
  }

  // Fire-and-forget: transcript row + notification. Never block the grade
  // response on these — a transcript/notification failure shouldn't make
  // the grade itself appear to have failed to save.
  supabaseAdmin
    .from("transcripts")
    .upsert(
      {
        student_id: existing.student_id,
        school_id: assignment?.courses?.school_id ?? null,
        course_id: assignment?.course_id ?? null,
        assignment_id: existing.assignment_id,
        submission_id: existing.id,
        grade: String(finalGrade),
        feedback: feedback ?? null,
        graded_at: updates.graded_at,
      },
      { onConflict: "submission_id" }
    )
    .then(({ error }) => {
      if (error) console.warn("[gradingEngine] transcript upsert failed:", error.message);
    });

  if (existing.student_id) {
    supabaseAdmin
      .from("notifications")
      .insert({
        user_id: existing.student_id,
        title: "Assignment graded",
        link: assignment?.course_id ? `/dashboard/student/courses/${assignment.course_id}` : null,
        is_read: false,
      })
      .then(({ error }) => {
        if (error) console.warn("[gradingEngine] grade notification failed:", error.message);
      });
  }

  return { ok: true, submission: updated };
}

// ---------------------------------------------------------------------------
// computeCourseGrade — the one correct formula for "what's this student's
// grade in this course," blending assignments, quizzes, and (optionally,
// per the course's own attendance_weight_percent setting) attendance.
// Every aggregate-grade call site in the app should go through this rather
// than recomputing its own average — previously ten different places each
// had a slightly different, sometimes-disagreeing formula.
// ---------------------------------------------------------------------------

export interface CourseGradeBreakdown {
  academicPercent: number | null;
  attendancePercent: number | null;
  attendanceWeightPercent: number;
  overallPercent: number | null;
  assignmentPointsEarned: number;
  assignmentPointsPossible: number;
  quizPointsEarned: number;
  quizPointsPossible: number;
}

export async function computeCourseGrade(courseId: string, studentId: string): Promise<CourseGradeBreakdown> {
  const [courseRes, assignmentsRes, quizzesRes, attendanceRes] = await Promise.all([
    supabaseAdmin.from("courses").select("attendance_weight_percent").eq("id", courseId).maybeSingle(),
    supabaseAdmin
      .from("assignments")
      .select("id, points_possible, submissions:submissions(grade, student_id)")
      .eq("course_id", courseId)
      .eq("is_published", true),
    supabaseAdmin.from("quizzes").select("id").eq("course_id", courseId),
    supabaseAdmin.from("attendance").select("status").eq("course_id", courseId).eq("student_id", studentId),
  ]);

  let assignmentPointsEarned = 0;
  let assignmentPointsPossible = 0;
  for (const a of assignmentsRes.data ?? []) {
    const possible = (a.points_possible as number | null) ?? 0;
    if (possible <= 0) continue;
    const subs = (a.submissions as unknown as { grade: number | null; student_id: string }[]) ?? [];
    const mine = subs.find((s) => s.student_id === studentId);
    if (!mine || mine.grade === null || mine.grade === undefined) continue;
    assignmentPointsEarned += mine.grade;
    assignmentPointsPossible += possible;
  }

  let quizPointsEarned = 0;
  let quizPointsPossible = 0;
  const quizIds = (quizzesRes.data ?? []).map((q) => q.id as string);
  if (quizIds.length > 0) {
    const { data: attempts } = await supabaseAdmin
      .from("quiz_attempts")
      .select("quiz_id, earned_points, total_points, submitted_at")
      .in("quiz_id", quizIds)
      .eq("student_id", studentId)
      .eq("status", "submitted")
      .order("submitted_at", { ascending: false });

    // Best (most recent, since order is submitted_at desc) attempt per quiz.
    const seenQuiz = new Set<string>();
    for (const attempt of attempts ?? []) {
      const qid = attempt.quiz_id as string;
      if (seenQuiz.has(qid)) continue;
      seenQuiz.add(qid);
      const earned = (attempt.earned_points as number | null) ?? 0;
      const total = (attempt.total_points as number | null) ?? 0;
      if (total <= 0) continue;
      quizPointsEarned += earned;
      quizPointsPossible += total;
    }
  }

  const academicPointsEarned = assignmentPointsEarned + quizPointsEarned;
  const academicPointsPossible = assignmentPointsPossible + quizPointsPossible;
  const academicPercent = academicPointsPossible > 0 ? (academicPointsEarned / academicPointsPossible) * 100 : null;

  const attendanceRows = attendanceRes.data ?? [];
  const attendancePercent =
    attendanceRows.length > 0
      ? (attendanceRows.filter((r) => r.status === "present" || r.status === "late").length / attendanceRows.length) * 100
      : null;

  const attendanceWeightPercent = (courseRes.data?.attendance_weight_percent as number | null) ?? 0;

  let overallPercent: number | null;
  if (attendanceWeightPercent > 0 && attendancePercent !== null && academicPercent !== null) {
    const w = attendanceWeightPercent / 100;
    overallPercent = academicPercent * (1 - w) + attendancePercent * w;
  } else {
    overallPercent = academicPercent;
  }

  return {
    academicPercent: academicPercent !== null ? Math.round(academicPercent * 10) / 10 : null,
    attendancePercent: attendancePercent !== null ? Math.round(attendancePercent * 10) / 10 : null,
    attendanceWeightPercent,
    overallPercent: overallPercent !== null ? Math.round(overallPercent * 10) / 10 : null,
    assignmentPointsEarned,
    assignmentPointsPossible,
    quizPointsEarned,
    quizPointsPossible,
  };
}

/** A-F letter grade from a 0-100 percentage, matching the thresholds already used client-side. */
export function percentToLetterGrade(percent: number | null): string | null {
  if (percent === null) return null;
  if (percent >= 90) return "A";
  if (percent >= 80) return "B";
  if (percent >= 70) return "C";
  if (percent >= 60) return "D";
  return "F";
}

/** 0-4 GPA points from a 0-100 percentage, matching StudentTranscript's existing mapping. */
export function percentToGpaPoints(percent: number | null): number | null {
  if (percent === null) return null;
  if (percent >= 90) return 4;
  if (percent >= 80) return 3;
  if (percent >= 70) return 2;
  if (percent >= 60) return 1;
  return 0;
}
