import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTeacherOrAdmin(role?: string): boolean {
  return role === "teacher" || role === "admin" || role === "super_admin";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// 1. GET /courses/:courseId/quizzes
// ---------------------------------------------------------------------------
router.get(
  "/courses/:courseId/quizzes",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const courseId = req.params.courseId;
    const userId = req.userId!;
    const role = req.userRole;

    try {
      let query = supabaseAdmin
        .from("quizzes")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: true });

      if (!isTeacherOrAdmin(role)) {
        query = query.eq("is_published", true);
      }

      const { data: quizzes, error } = await query;
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      if (isTeacherOrAdmin(role)) {
        res.json(quizzes ?? []);
        return;
      }

      // For students: include attempt count per quiz
      const result = await Promise.all(
        (quizzes ?? []).map(async (quiz: Record<string, unknown>) => {
          const { count } = await supabaseAdmin
            .from("quiz_attempts")
            .select("id", { count: "exact", head: true })
            .eq("quiz_id", quiz.id as string)
            .eq("student_id", userId);

          return { ...quiz, attemptCount: count ?? 0 };
        })
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 2. POST /courses/:courseId/quizzes
// ---------------------------------------------------------------------------
router.post(
  "/courses/:courseId/quizzes",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const courseId = req.params.courseId;
    const {
      title,
      description,
      timeLimitMinutes,
      maxAttempts,
      randomizeQuestions,
      randomizeOptions,
      showResultsImmediately,
      isPublished,
    } = req.body;

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    try {
      const { data, error } = await supabaseAdmin
        .from("quizzes")
        .insert({
          course_id: courseId,
          title,
          description: description ?? null,
          time_limit_minutes: timeLimitMinutes ?? null,
          max_attempts: maxAttempts ?? null,
          randomize_questions: randomizeQuestions ?? false,
          randomize_options: randomizeOptions ?? false,
          show_results_immediately: showResultsImmediately ?? true,
          is_published: isPublished ?? false,
          created_by: req.userId,
        })
        .select()
        .single();

      if (error) {
        res.status(400).json({ error: error.message });
        return;
      }

      res.status(201).json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 3. GET /quizzes/:quizId
// ---------------------------------------------------------------------------
router.get(
  "/quizzes/:quizId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const quizId = req.params.quizId;
    const role = req.userRole;
    const isPrivileged = isTeacherOrAdmin(role);

    try {
      const { data: quiz, error: quizError } = await supabaseAdmin
        .from("quizzes")
        .select("*")
        .eq("id", quizId)
        .single();

      if (quizError || !quiz) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }

      if (!isPrivileged && !quiz.is_published) {
        res.status(403).json({ error: "Quiz is not published" });
        return;
      }

      // Fetch questions
      const { data: questions, error: qError } = await supabaseAdmin
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("sort_order", { ascending: true });

      if (qError) {
        res.status(500).json({ error: qError.message });
        return;
      }

      // Fetch options for all questions
      const questionIds = (questions ?? []).map(
        (q: Record<string, unknown>) => q.id as string
      );

      let optionsData: Record<string, unknown>[] = [];
      if (questionIds.length > 0) {
        const { data: opts, error: oError } = await supabaseAdmin
          .from("quiz_options")
          .select("*")
          .in("question_id", questionIds)
          .order("sort_order", { ascending: true });

        if (oError) {
          res.status(500).json({ error: oError.message });
          return;
        }
        optionsData = opts ?? [];
      }

      const questionsWithOptions = (questions ?? []).map(
        (q: Record<string, unknown>) => {
          let opts = optionsData.filter(
            (o) => o.question_id === q.id
          );

          if (!isPrivileged) {
            // Strip correct answer info from options for students
            opts = opts.map(({ is_correct: _ic, ...rest }) => rest);
          }

          return { ...q, options: opts };
        }
      );

      res.json({ ...quiz, questions: questionsWithOptions });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 4. PATCH /quizzes/:quizId
// ---------------------------------------------------------------------------
router.patch(
  "/quizzes/:quizId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const quizId = req.params.quizId;
    const {
      title,
      description,
      timeLimitMinutes,
      maxAttempts,
      randomizeQuestions,
      randomizeOptions,
      showResultsImmediately,
      isPublished,
    } = req.body;

    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (timeLimitMinutes !== undefined) updates.time_limit_minutes = timeLimitMinutes;
    if (maxAttempts !== undefined) updates.max_attempts = maxAttempts;
    if (randomizeQuestions !== undefined) updates.randomize_questions = randomizeQuestions;
    if (randomizeOptions !== undefined) updates.randomize_options = randomizeOptions;
    if (showResultsImmediately !== undefined) updates.show_results_immediately = showResultsImmediately;
    if (isPublished !== undefined) updates.is_published = isPublished;

    try {
      const { data, error } = await supabaseAdmin
        .from("quizzes")
        .update(updates)
        .eq("id", quizId)
        .select()
        .single();

      if (error || !data) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 5. DELETE /quizzes/:quizId
// ---------------------------------------------------------------------------
router.delete(
  "/quizzes/:quizId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const quizId = req.params.quizId;

    try {
      const { error } = await supabaseAdmin
        .from("quizzes")
        .delete()
        .eq("id", quizId);

      if (error) {
        res.status(404).json({ error: "Quiz not found" });
        return;
      }

      res.sendStatus(204);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 6. POST /quizzes/:quizId/questions
// ---------------------------------------------------------------------------
router.post(
  "/quizzes/:quizId/questions",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const quizId = req.params.quizId;
    const {
      questionText,
      questionType,
      points,
      sortOrder,
      explanation,
      options,
    } = req.body;

    if (!questionText || !questionType) {
      res.status(400).json({ error: "questionText and questionType are required" });
      return;
    }

    const validTypes = ["multiple_choice", "true_false", "short_answer", "essay"];
    if (!validTypes.includes(questionType)) {
      res.status(400).json({ error: `questionType must be one of: ${validTypes.join(", ")}` });
      return;
    }

    try {
      const { data: question, error: qError } = await supabaseAdmin
        .from("quiz_questions")
        .insert({
          quiz_id: quizId,
          question_text: questionText,
          question_type: questionType,
          points: points ?? 1,
          sort_order: sortOrder ?? 0,
          explanation: explanation ?? null,
        })
        .select()
        .single();

      if (qError) {
        res.status(400).json({ error: qError.message });
        return;
      }

      let insertedOptions: Record<string, unknown>[] = [];
      if (options && Array.isArray(options) && options.length > 0) {
        const optionRows = options.map(
          (
            opt: { optionText: string; isCorrect?: boolean; matchText?: string },
            idx: number
          ) => ({
            question_id: question.id,
            option_text: opt.optionText,
            is_correct: opt.isCorrect ?? false,
            match_text: opt.matchText ?? null,
            sort_order: idx,
          })
        );

        const { data: opts, error: oError } = await supabaseAdmin
          .from("quiz_options")
          .insert(optionRows)
          .select();

        if (oError) {
          res.status(400).json({ error: oError.message });
          return;
        }

        insertedOptions = opts ?? [];
      }

      res.status(201).json({ ...question, options: insertedOptions });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 7. PATCH /quizzes/:quizId/questions/:questionId
// ---------------------------------------------------------------------------
router.patch(
  "/quizzes/:quizId/questions/:questionId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { quizId, questionId } = req.params;
    const { questionText, questionType, points, sortOrder, explanation } = req.body;

    const updates: Record<string, unknown> = {};
    if (questionText !== undefined) updates.question_text = questionText;
    if (questionType !== undefined) updates.question_type = questionType;
    if (points !== undefined) updates.points = points;
    if (sortOrder !== undefined) updates.sort_order = sortOrder;
    if (explanation !== undefined) updates.explanation = explanation;

    try {
      const { data, error } = await supabaseAdmin
        .from("quiz_questions")
        .update(updates)
        .eq("id", questionId)
        .eq("quiz_id", quizId)
        .select()
        .single();

      if (error || !data) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 8. DELETE /quizzes/:quizId/questions/:questionId
// ---------------------------------------------------------------------------
router.delete(
  "/quizzes/:quizId/questions/:questionId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { quizId, questionId } = req.params;

    try {
      const { error } = await supabaseAdmin
        .from("quiz_questions")
        .delete()
        .eq("id", questionId)
        .eq("quiz_id", quizId);

      if (error) {
        res.status(404).json({ error: "Question not found" });
        return;
      }

      res.sendStatus(204);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 9. POST /quizzes/:quizId/attempt — start attempt
// ---------------------------------------------------------------------------
router.post(
  "/quizzes/:quizId/attempt",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Only students can start quiz attempts" });
      return;
    }

    const quizId = req.params.quizId;
    const userId = req.userId!;

    try {
      // Fetch quiz
      const { data: quiz, error: quizError } = await supabaseAdmin
        .from("quizzes")
        .select("*")
        .eq("id", quizId)
        .eq("is_published", true)
        .single();

      if (quizError || !quiz) {
        res.status(404).json({ error: "Quiz not found or not published" });
        return;
      }

      // Check max attempts
      if (quiz.max_attempts !== null) {
        const { count } = await supabaseAdmin
          .from("quiz_attempts")
          .select("id", { count: "exact", head: true })
          .eq("quiz_id", quizId)
          .eq("student_id", userId);

        if ((count ?? 0) >= quiz.max_attempts) {
          res.status(400).json({ error: "Maximum attempts reached" });
          return;
        }
      }

      // Create attempt
      const { data: attempt, error: attemptError } = await supabaseAdmin
        .from("quiz_attempts")
        .insert({
          quiz_id: quizId,
          student_id: userId,
          started_at: new Date().toISOString(),
          status: "in_progress",
        })
        .select()
        .single();

      if (attemptError) {
        res.status(400).json({ error: attemptError.message });
        return;
      }

      // Fetch questions
      const { data: questions, error: qError } = await supabaseAdmin
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", quizId)
        .order("sort_order", { ascending: true });

      if (qError) {
        res.status(500).json({ error: qError.message });
        return;
      }

      let questionList = questions ?? [];
      if (quiz.randomize_questions) {
        questionList = shuffle(questionList);
      }

      // Fetch options for multiple_choice / true_false questions
      const questionIds = questionList.map(
        (q: Record<string, unknown>) => q.id as string
      );

      let optionsMap: Record<string, Record<string, unknown>[]> = {};
      if (questionIds.length > 0) {
        const { data: opts } = await supabaseAdmin
          .from("quiz_options")
          .select("*")
          .in("question_id", questionIds)
          .order("sort_order", { ascending: true });

        for (const opt of opts ?? []) {
          const qid = opt.question_id as string;
          if (!optionsMap[qid]) optionsMap[qid] = [];
          optionsMap[qid].push(opt);
        }
      }

      const questionsWithOptions = questionList.map(
        (q: Record<string, unknown>) => {
          const qType = q.question_type as string;
          if (qType === "multiple_choice" || qType === "true_false") {
            let opts = (optionsMap[q.id as string] ?? []).map(
              ({ is_correct: _ic, ...rest }) => rest
            );
            if (quiz.randomize_options) {
              opts = shuffle(opts);
            }
            return { ...q, options: opts };
          }
          return q;
        }
      );

      res.status(201).json({ ...attempt, questions: questionsWithOptions });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 10. POST /attempts/:attemptId/submit
// ---------------------------------------------------------------------------
router.post(
  "/attempts/:attemptId/submit",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const attemptId = req.params.attemptId;
    const userId = req.userId!;
    const { answers } = req.body;

    if (!Array.isArray(answers)) {
      res.status(400).json({ error: "answers must be an array" });
      return;
    }

    try {
      // Fetch attempt and verify ownership
      const { data: attempt, error: attemptError } = await supabaseAdmin
        .from("quiz_attempts")
        .select("*")
        .eq("id", attemptId)
        .single();

      if (attemptError || !attempt) {
        res.status(404).json({ error: "Attempt not found" });
        return;
      }

      if (attempt.student_id !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      if (attempt.status !== "in_progress") {
        res.status(400).json({ error: "Attempt already submitted" });
        return;
      }

      // Fetch quiz for show_results_immediately flag
      const { data: quiz } = await supabaseAdmin
        .from("quizzes")
        .select("*")
        .eq("id", attempt.quiz_id)
        .single();

      // Fetch all questions for this quiz
      const { data: questions } = await supabaseAdmin
        .from("quiz_questions")
        .select("*")
        .eq("quiz_id", attempt.quiz_id);

      const questionMap: Record<string, Record<string, unknown>> = {};
      for (const q of questions ?? []) {
        questionMap[q.id as string] = q;
      }

      // Fetch all options for auto-grading
      const questionIds = Object.keys(questionMap);
      let optionsMap: Record<string, Record<string, unknown>[]> = {};
      if (questionIds.length > 0) {
        const { data: opts } = await supabaseAdmin
          .from("quiz_options")
          .select("*")
          .in("question_id", questionIds);

        for (const opt of opts ?? []) {
          const qid = opt.question_id as string;
          if (!optionsMap[qid]) optionsMap[qid] = [];
          optionsMap[qid].push(opt);
        }
      }

      // Grade answers and insert quiz_answers rows
      let totalPoints = 0;
      let earnedPoints = 0;
      let hasManualGrading = false;

      const answerRows: Record<string, unknown>[] = [];
      const gradedAnswers: Record<string, unknown>[] = [];

      for (const answer of answers as {
        questionId: string;
        answerText?: string;
        selectedOptionId?: string;
      }[]) {
        const question = questionMap[answer.questionId];
        if (!question) continue;

        const qType = question.question_type as string;
        const qPoints = (question.points as number) ?? 1;
        totalPoints += qPoints;

        let isCorrect: boolean | null = null;
        let pointsEarned = 0;

        if (qType === "multiple_choice" || qType === "true_false") {
          if (answer.selectedOptionId) {
            const selectedOpt = (optionsMap[answer.questionId] ?? []).find(
              (o) => o.id === answer.selectedOptionId
            );
            isCorrect = selectedOpt ? (selectedOpt.is_correct as boolean) : false;
            pointsEarned = isCorrect ? qPoints : 0;
            earnedPoints += pointsEarned;
          } else {
            isCorrect = false;
          }
        } else {
          // short_answer / essay — manual grading needed
          hasManualGrading = true;
          isCorrect = null;
        }

        const row: Record<string, unknown> = {
          attempt_id: attemptId,
          question_id: answer.questionId,
          answer_text: answer.answerText ?? null,
          selected_option_id: answer.selectedOptionId ?? null,
          is_correct: isCorrect,
          points_earned: isCorrect === true ? pointsEarned : isCorrect === false ? 0 : null,
        };
        answerRows.push(row);
        gradedAnswers.push(row);
      }

      // Insert answers
      if (answerRows.length > 0) {
        const { error: insertError } = await supabaseAdmin
          .from("quiz_answers")
          .insert(answerRows);

        if (insertError) {
          res.status(400).json({ error: insertError.message });
          return;
        }
      }

      // Calculate score percentage (only from auto-graded questions)
      const autoGradedTotal = (questions ?? [])
        .filter((q: Record<string, unknown>) => {
          const t = q.question_type as string;
          return t === "multiple_choice" || t === "true_false";
        })
        .reduce((sum: number, q: Record<string, unknown>) => sum + ((q.points as number) ?? 1), 0);

      const score = autoGradedTotal > 0
        ? Math.round((earnedPoints / autoGradedTotal) * 100)
        : null;

      const newStatus = hasManualGrading ? "submitted" : "graded";

      // Update attempt
      const { data: updatedAttempt, error: updateError } = await supabaseAdmin
        .from("quiz_attempts")
        .update({
          submitted_at: new Date().toISOString(),
          score,
          status: newStatus,
        })
        .eq("id", attemptId)
        .select()
        .single();

      if (updateError) {
        res.status(500).json({ error: updateError.message });
        return;
      }

      // Build response
      const response: Record<string, unknown> = {
        attempt: updatedAttempt,
        earnedPoints,
        totalPoints,
        score,
        status: newStatus,
      };

      if (quiz?.show_results_immediately) {
        // Include correct answers
        const answersWithCorrect = gradedAnswers.map((a) => {
          const qid = a.question_id as string;
          const question = questionMap[qid];
          const qType = question?.question_type as string;
          let correctAnswer: unknown = null;

          if (qType === "multiple_choice" || qType === "true_false") {
            const correctOpt = (optionsMap[qid] ?? []).find(
              (o) => o.is_correct === true
            );
            correctAnswer = correctOpt ?? null;
          } else {
            correctAnswer = question?.explanation ?? null;
          }

          return {
            ...a,
            correctAnswer,
            explanation: question?.explanation ?? null,
          };
        });
        response.answers = answersWithCorrect;
      } else {
        response.answers = gradedAnswers.map(({ is_correct: _ic, points_earned: _pe, ...rest }) => rest);
      }

      res.json(response);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 11. GET /quizzes/:quizId/results — teacher view of all attempts
// ---------------------------------------------------------------------------
router.get(
  "/quizzes/:quizId/results",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    if (!isTeacherOrAdmin(req.userRole)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const quizId = req.params.quizId;

    try {
      const { data: attempts, error } = await supabaseAdmin
        .from("quiz_attempts")
        .select("*")
        .eq("quiz_id", quizId)
        .order("submitted_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      // Enrich with student names
      const result = await Promise.all(
        (attempts ?? []).map(async (attempt: Record<string, unknown>) => {
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("first_name, last_name, email")
            .eq("id", attempt.student_id as string)
            .single();

          const studentName = profile
            ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() ||
              profile.email
            : attempt.student_id;

          return {
            id: attempt.id,
            studentId: attempt.student_id,
            studentName,
            score: attempt.score,
            submittedAt: attempt.submitted_at,
            startedAt: attempt.started_at,
            status: attempt.status,
          };
        })
      );

      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ---------------------------------------------------------------------------
// 12. GET /attempts/:attemptId — get attempt details
// ---------------------------------------------------------------------------
router.get(
  "/attempts/:attemptId",
  requireAuth,
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const attemptId = req.params.attemptId;
    const userId = req.userId!;
    const role = req.userRole;

    try {
      const { data: attempt, error: attemptError } = await supabaseAdmin
        .from("quiz_attempts")
        .select("*")
        .eq("id", attemptId)
        .single();

      if (attemptError || !attempt) {
        res.status(404).json({ error: "Attempt not found" });
        return;
      }

      // Students can only view their own attempts
      if (!isTeacherOrAdmin(role) && attempt.student_id !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // Fetch answers
      const { data: answers, error: answersError } = await supabaseAdmin
        .from("quiz_answers")
        .select("*")
        .eq("attempt_id", attemptId);

      if (answersError) {
        res.status(500).json({ error: answersError.message });
        return;
      }

      // Fetch quiz for context
      const { data: quiz } = await supabaseAdmin
        .from("quizzes")
        .select("id, title, show_results_immediately")
        .eq("id", attempt.quiz_id)
        .single();

      res.json({
        ...attempt,
        quiz: quiz ?? null,
        answers: answers ?? [],
      });
    } catch (err) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
