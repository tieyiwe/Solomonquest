import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRoute, Link } from "wouter";
import { StudentLayout } from "@/components/layout/StudentLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Clock,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FileQuestion,
  Award,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizOption {
  id: string;
  text: string;
  is_correct?: boolean;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "essay" | "fill_blank";
  options?: QuizOption[];
  points: number;
  explanation?: string;
  correct_answer?: string;
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  time_limit_minutes?: number;
  attempt_limit?: number;
  show_results_immediately?: boolean;
  release_scores_immediately?: boolean;
  questions: QuizQuestion[];
}

interface AttemptInfo {
  attempts_used: number;
  attempt_limit: number | null;
  remaining_attempts: number | null;
}

interface QuestionResult {
  question_id: string;
  is_correct?: boolean;
  correct_answer?: string;
  explanation?: string;
}

interface SubmissionResult {
  score?: number;
  max_score?: number;
  percentage?: number;
  release_scores_immediately?: boolean;
  show_results_immediately?: boolean;
  question_results?: QuestionResult[];
}

function TimerDisplay({ seconds }: { seconds: number }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isWarning = seconds < 300;
  const isDanger = seconds < 60;

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 font-mono text-sm font-semibold px-3 py-1.5 rounded-full transition-colors",
        isDanger
          ? "bg-destructive/20 text-destructive animate-pulse"
          : isWarning
          ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
          : "bg-muted text-muted-foreground"
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {mins}:{secs.toString().padStart(2, "0")}
    </div>
  );
}

function MultipleChoiceInput({
  question,
  value,
  onChange,
  result,
  showResults,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  result?: QuestionResult;
  showResults: boolean;
}) {
  return (
    <div className="space-y-3">
      {question.options?.map((opt) => {
        const isSelected = value === opt.id;
        const isCorrect = opt.is_correct;
        let optStyle = "border-border hover:border-primary/60 hover:bg-muted/40";
        if (showResults && result) {
          if (isCorrect) optStyle = "border-green-500 bg-green-50 dark:bg-green-900/20";
          else if (isSelected && !isCorrect) optStyle = "border-destructive bg-destructive/10";
        } else if (isSelected) {
          optStyle = "border-primary bg-primary/5";
        }

        return (
          <label
            key={opt.id}
            className={cn(
              "flex items-center gap-3 cursor-pointer p-3.5 rounded-xl border-2 transition-all",
              optStyle,
              showResults && "cursor-default"
            )}
          >
            <input
              type="radio"
              name={`q-${question.id}`}
              value={opt.id}
              checked={isSelected}
              onChange={() => !showResults && onChange(opt.id)}
              className="accent-primary"
              disabled={showResults}
            />
            <span className="text-sm flex-1">{opt.text}</span>
            {showResults && result && isCorrect && (
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
            )}
            {showResults && result && isSelected && !isCorrect && (
              <XCircle className="h-4 w-4 text-destructive shrink-0" />
            )}
          </label>
        );
      })}
    </div>
  );
}

function TrueFalseInput({
  question,
  value,
  onChange,
  result,
  showResults,
}: {
  question: QuizQuestion;
  value: string;
  onChange: (v: string) => void;
  result?: QuestionResult;
  showResults: boolean;
}) {
  return (
    <div className="flex gap-4">
      {["True", "False"].map((opt) => {
        const isSelected = value === opt;
        const isCorrect = showResults && result && result.correct_answer === opt;
        const isWrong = showResults && result && isSelected && !isCorrect;

        return (
          <button
            key={opt}
            type="button"
            disabled={showResults}
            onClick={() => !showResults && onChange(opt)}
            className={cn(
              "flex-1 py-4 rounded-xl border-2 text-sm font-semibold transition-all",
              showResults
                ? isCorrect
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                  : isWrong
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground"
                : isSelected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border hover:border-primary/60 hover:bg-muted/40"
            )}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function StudentQuizTake() {
  const [, params] = useRoute("/dashboard/student/quiz/:id");
  const quizId = params?.id;
  const { session } = useAuth();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<AttemptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [startingQuiz, setStartingQuiz] = useState(false);

  useEffect(() => {
    if (!quizId || !session) return;
    const fetchData = async () => {
      try {
        const [quizRes, attemptsRes] = await Promise.all([
          fetch(`/api/quizzes/${quizId}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
          fetch(`/api/quizzes/${quizId}/attempts`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          }),
        ]);
        if (!quizRes.ok) throw new Error("Failed to load quiz");
        const quizData = await quizRes.json();
        setQuiz(quizData);
        if (attemptsRes.ok) {
          const attemptsData = await attemptsRes.json();
          setAttemptInfo(attemptsData);
        }
      } catch {
        toast.error("Failed to load quiz");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [quizId, session]);

  const submitQuiz = useCallback(
    async (currentAnswers: Record<string, string>) => {
      if (!quizId || !attemptId || !session) return;
      setSubmitting(true);
      try {
        const res = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ answers: currentAnswers }),
        });
        if (!res.ok) throw new Error("Failed to submit quiz");
        const data = await res.json();
        setResult(data);
        setSubmitted(true);
        toast.success("Quiz submitted successfully");
      } catch {
        toast.error("Failed to submit quiz");
      } finally {
        setSubmitting(false);
      }
    },
    [quizId, attemptId, session]
  );

  useEffect(() => {
    if (!started || timeLeft === null) return;
    if (timeLeft <= 0) {
      toast.warning("Time is up! Submitting your quiz.");
      submitQuiz(answers);
      return;
    }
    const timer = setTimeout(() => setTimeLeft((t) => (t !== null ? t - 1 : null)), 1000);
    return () => clearTimeout(timer);
  }, [started, timeLeft, answers, submitQuiz]);

  const startQuiz = async () => {
    if (!quizId || !session) return;
    setStartingQuiz(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error("Failed to start quiz");
      const data = await res.json();
      setAttemptId(data.id || data.attempt_id);
      setStarted(true);
      if (quiz?.time_limit_minutes) {
        setTimeLeft(quiz.time_limit_minutes * 60);
      }
    } catch {
      toast.error("Failed to start quiz");
    } finally {
      setStartingQuiz(false);
    }
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  if (loading) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </StudentLayout>
    );
  }

  if (!quiz) {
    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto py-20 text-center">
          <FileQuestion className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold">Quiz not found</h2>
          <Button variant="outline" asChild className="mt-4">
            <Link href="/dashboard/student">Back to Dashboard</Link>
          </Button>
        </div>
      </StudentLayout>
    );
  }

  const hasRemainingAttempts =
    !attemptInfo ||
    attemptInfo.remaining_attempts === null ||
    attemptInfo.remaining_attempts > 0;

  if (submitted && result) {
    const showScore = result.release_scores_immediately || result.show_results_immediately;
    const percentage =
      result.percentage ??
      (result.score != null && result.max_score
        ? Math.round((result.score / result.max_score) * 100)
        : null);
    const passed = percentage != null && percentage >= 70;

    return (
      <StudentLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="text-center py-8">
            <div
              className={cn(
                "h-20 w-20 rounded-full flex items-center justify-center mx-auto mb-4",
                showScore
                  ? passed
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-orange-100 dark:bg-orange-900/30"
                  : "bg-primary/10"
              )}
            >
              {showScore ? (
                passed ? (
                  <Award className="h-10 w-10 text-green-600" />
                ) : (
                  <AlertTriangle className="h-10 w-10 text-orange-500" />
                )
              ) : (
                <CheckCircle2 className="h-10 w-10 text-primary" />
              )}
            </div>
            <h1 className="text-3xl font-bold text-foreground">Quiz Submitted!</h1>
            <p className="text-muted-foreground mt-2">{quiz.title}</p>

            {showScore && result.score != null ? (
              <div className="mt-6 space-y-3">
                <div className="text-5xl font-black text-foreground">{percentage}%</div>
                <p className="text-lg text-muted-foreground">
                  {result.score} / {result.max_score} points
                </p>
                <div className="max-w-xs mx-auto">
                  <Progress value={percentage ?? 0} className="h-3" />
                </div>
                <Badge
                  className={cn(
                    "text-sm px-4 py-1",
                    passed
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                  )}
                >
                  {passed ? "Passed" : "Needs Improvement"}
                </Badge>
              </div>
            ) : (
              <p className="text-muted-foreground mt-4">
                Your submission has been recorded. Results will be available when released by your
                instructor.
              </p>
            )}
          </div>

          {showScore && result.question_results && result.question_results.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Question Review</h2>
              {quiz.questions.map((q, idx) => {
                const qResult = result.question_results?.find((r) => r.question_id === q.id);
                const userAnswer = answers[q.id];

                return (
                  <Card
                    key={q.id}
                    className={cn(
                      "border-l-4",
                      qResult?.is_correct === true
                        ? "border-l-green-500"
                        : qResult?.is_correct === false
                        ? "border-l-destructive"
                        : "border-l-muted"
                    )}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <span className="text-xs font-bold text-muted-foreground mt-0.5 shrink-0">
                          Q{idx + 1}
                        </span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {q.question_text}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{q.points} pts</span>
                            {qResult?.is_correct === true && (
                              <span className="text-xs text-green-600 font-medium flex items-center gap-0.5">
                                <CheckCircle2 className="h-3 w-3" /> Correct
                              </span>
                            )}
                            {qResult?.is_correct === false && (
                              <span className="text-xs text-destructive font-medium flex items-center gap-0.5">
                                <XCircle className="h-3 w-3" /> Incorrect
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      {q.question_type === "multiple_choice" && (
                        <MultipleChoiceInput
                          question={q}
                          value={userAnswer ?? ""}
                          onChange={() => {}}
                          result={qResult}
                          showResults
                        />
                      )}
                      {q.question_type === "true_false" && (
                        <TrueFalseInput
                          question={q}
                          value={userAnswer ?? ""}
                          onChange={() => {}}
                          result={qResult}
                          showResults
                        />
                      )}
                      {(q.question_type === "short_answer" ||
                        q.question_type === "essay" ||
                        q.question_type === "fill_blank") && (
                        <div className="space-y-2">
                          <div className="bg-muted/40 rounded-lg p-3">
                            <p className="text-xs text-muted-foreground mb-1">Your answer:</p>
                            <p className="text-sm">{userAnswer || "(no answer)"}</p>
                          </div>
                          {qResult?.correct_answer && (
                            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                              <p className="text-xs text-green-700 dark:text-green-400 mb-1 font-medium">
                                Correct answer:
                              </p>
                              <p className="text-sm text-green-800 dark:text-green-300">
                                {qResult.correct_answer}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                      {(qResult?.explanation || q.explanation) && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 mt-2">
                          <p className="text-xs text-blue-700 dark:text-blue-400 font-medium mb-1">
                            Explanation:
                          </p>
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            {qResult?.explanation || q.explanation}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <div className="flex justify-center">
            <Button asChild>
              <Link href="/dashboard/student">Back to Dashboard</Link>
            </Button>
          </div>
        </div>
      </StudentLayout>
    );
  }

  if (!started) {
    return (
      <StudentLayout>
        <div className="max-w-2xl mx-auto space-y-6 py-8">
          <Button variant="ghost" size="sm" asChild className="-ml-2 text-muted-foreground">
            <Link href="/dashboard/student">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back
            </Link>
          </Button>

          <Card>
            <CardContent className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <FileQuestion className="h-7 w-7 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-foreground">{quiz.title}</h1>
                  {quiz.description && (
                    <p className="text-muted-foreground mt-1">{quiz.description}</p>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-muted/40 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {quiz.questions?.length ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Questions</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {quiz.time_limit_minutes ? `${quiz.time_limit_minutes}m` : "None"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Time Limit</p>
                </div>
                <div className="bg-muted/40 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {quiz.attempt_limit ?? "Unlimited"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Attempts Allowed</p>
                </div>
              </div>

              {attemptInfo && attemptInfo.attempts_used > 0 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-lg px-4 py-3">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                  You have used {attemptInfo.attempts_used} attempt
                  {attemptInfo.attempts_used !== 1 ? "s" : ""}.
                  {attemptInfo.remaining_attempts != null &&
                    ` ${attemptInfo.remaining_attempts} remaining.`}
                </div>
              )}

              {quiz.time_limit_minutes && (
                <div className="flex items-start gap-2 text-sm text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg px-4 py-3">
                  <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    Once you start, the timer begins immediately and cannot be paused. Make sure you
                    have {quiz.time_limit_minutes} minutes available.
                  </p>
                </div>
              )}

              {!hasRemainingAttempts ? (
                <div className="text-center">
                  <p className="text-destructive font-medium">
                    You have used all your attempts for this quiz.
                  </p>
                  <Button variant="outline" asChild className="mt-3">
                    <Link href="/dashboard/student">Back to Dashboard</Link>
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={startQuiz}
                  size="lg"
                  className="w-full"
                  disabled={startingQuiz}
                >
                  {startingQuiz ? "Starting..." : "Start Quiz"}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </StudentLayout>
    );
  }

  const questions = quiz.questions ?? [];
  const currentQuestion = questions[currentIndex];
  const answeredCount = Object.keys(answers).length;
  const progress = questions.length > 0 ? (answeredCount / questions.length) * 100 : 0;

  return (
    <StudentLayout>
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-foreground truncate">{quiz.title}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {answeredCount}/{questions.length} answered
              </span>
              <Progress value={progress} className="h-1.5 w-24" />
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {timeLeft !== null && <TimerDisplay seconds={timeLeft} />}
            <Button
              onClick={() => submitQuiz(answers)}
              disabled={submitting}
              size="sm"
            >
              {submitting ? "Submitting..." : "Submit Quiz"}
            </Button>
          </div>
        </div>

        <div className="flex gap-4">
          <aside className="hidden sm:flex flex-col gap-2 shrink-0 w-44">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
              Questions
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    "h-8 w-8 rounded-md text-xs font-medium transition-colors border",
                    idx === currentIndex
                      ? "bg-primary text-primary-foreground border-primary"
                      : answers[q.id]
                      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700"
                      : "bg-background border-border hover:bg-muted/50"
                  )}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {currentQuestion ? (
              <Card>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Question {currentIndex + 1} of {questions.length}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {currentQuestion.points} {currentQuestion.points === 1 ? "pt" : "pts"}
                      </Badge>
                    </div>
                    <h2 className="text-lg font-medium text-foreground leading-relaxed">
                      {currentQuestion.question_text}
                    </h2>
                  </div>

                  {currentQuestion.question_type === "multiple_choice" && (
                    <MultipleChoiceInput
                      question={currentQuestion}
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(v) => handleAnswer(currentQuestion.id, v)}
                      showResults={false}
                    />
                  )}

                  {currentQuestion.question_type === "true_false" && (
                    <TrueFalseInput
                      question={currentQuestion}
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(v) => handleAnswer(currentQuestion.id, v)}
                      showResults={false}
                    />
                  )}

                  {currentQuestion.question_type === "essay" && (
                    <textarea
                      className="w-full min-h-[160px] p-4 rounded-xl border-2 border-border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                      placeholder="Write your essay answer here..."
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                    />
                  )}

                  {currentQuestion.question_type === "short_answer" && (
                    <textarea
                      className="w-full min-h-[80px] p-4 rounded-xl border-2 border-border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                      placeholder="Type your answer here..."
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                    />
                  )}

                  {currentQuestion.question_type === "fill_blank" && (
                    <input
                      type="text"
                      className="w-full p-4 rounded-xl border-2 border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary text-sm"
                      placeholder="Fill in the blank..."
                      value={answers[currentQuestion.id] ?? ""}
                      onChange={(e) => handleAnswer(currentQuestion.id, e.target.value)}
                    />
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                      disabled={currentIndex === 0}
                    >
                      <ChevronLeft className="mr-1 h-4 w-4" />
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground sm:hidden">
                      {currentIndex + 1} / {questions.length}
                    </span>
                    {currentIndex < questions.length - 1 ? (
                      <Button
                        variant="outline"
                        onClick={() =>
                          setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
                        }
                      >
                        Next
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => submitQuiz(answers)}
                        disabled={submitting}
                      >
                        {submitting ? "Submitting..." : "Submit Quiz"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No questions available.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </StudentLayout>
  );
}
