import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, CheckCircle } from "lucide-react";
import { useRoute } from "wouter";

interface QuizOption {
  id: string;
  text: string;
}

interface QuizQuestion {
  id: string;
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "essay" | "fill_blank";
  options?: QuizOption[];
  points: number;
}

interface Quiz {
  id: string;
  title: string;
  description?: string;
  time_limit_minutes?: number;
  attempt_limit?: number;
  release_scores_immediately?: boolean;
  questions: QuizQuestion[];
}

interface AttemptInfo {
  attempts_used: number;
  attempt_limit: number | null;
  remaining_attempts: number | null;
}

interface SubmissionResult {
  score?: number;
  max_score?: number;
  release_scores_immediately?: boolean;
}

export default function StudentQuizTake() {
  const [, params] = useRoute("/student/quiz/:id");
  const quizId = params?.id;
  const { token } = useAuth();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<AttemptInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState<SubmissionResult | null>(null);

  useEffect(() => {
    if (!quizId) return;
    const fetchData = async () => {
      try {
        const [quizRes, attemptsRes] = await Promise.all([
          fetch(`/api/quizzes/${quizId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/quizzes/${quizId}/attempts`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);
        if (!quizRes.ok) throw new Error("Failed to load quiz");
        const quizData = await quizRes.json();
        setQuiz(quizData);

        if (attemptsRes.ok) {
          const attemptsData = await attemptsRes.json();
          setAttemptInfo(attemptsData);
        }
      } catch (err) {
        toast.error("Failed to load quiz");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [quizId, token]);

  const submitQuiz = useCallback(async (currentAnswers: Record<string, string>) => {
    if (!quizId || !attemptId) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempts/${attemptId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ answers: currentAnswers }),
      });
      if (!res.ok) throw new Error("Failed to submit quiz");
      const data = await res.json();
      setResult(data);
      setSubmitted(true);
      toast.success("Quiz submitted successfully");
    } catch (err) {
      toast.error("Failed to submit quiz");
    } finally {
      setSubmitting(false);
    }
  }, [quizId, attemptId, token]);

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
    if (!quizId) return;
    try {
      const res = await fetch(`/api/quizzes/${quizId}/attempts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to start quiz");
      const data = await res.json();
      setAttemptId(data.id || data.attempt_id);
      setStarted(true);
      if (quiz?.time_limit_minutes) {
        setTimeLeft(quiz.time_limit_minutes * 60);
      }
    } catch (err) {
      toast.error("Failed to start quiz");
    }
  };

  const handleAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading quiz...</p>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Quiz not found.</p>
      </div>
    );
  }

  const hasRemainingAttempts =
    attemptInfo === null ||
    attemptInfo.remaining_attempts === null ||
    attemptInfo.remaining_attempts > 0;

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center space-y-4">
        <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
        <h2 className="text-2xl font-semibold">Quiz Submitted</h2>
        {result?.release_scores_immediately && result.score !== undefined ? (
          <div className="space-y-1">
            <p className="text-lg">
              Your score:{" "}
              <span className="font-bold text-primary">
                {result.score} / {result.max_score}
              </span>
            </p>
            <p className="text-muted-foreground">
              {result.max_score
                ? `${Math.round((result.score / result.max_score) * 100)}%`
                : ""}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">Your submission has been recorded.</p>
        )}
      </div>
    );
  }

  if (!started) {
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-6">
        <h1 className="text-3xl font-bold">{quiz.title}</h1>
        {quiz.description && (
          <p className="text-muted-foreground">{quiz.description}</p>
        )}
        <div className="space-y-2 text-sm">
          {quiz.time_limit_minutes && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>Time limit: {quiz.time_limit_minutes} minutes</span>
            </div>
          )}
          {quiz.attempt_limit && (
            <p>
              Attempt limit: {quiz.attempt_limit}
              {attemptInfo && ` (${attemptInfo.attempts_used} used)`}
            </p>
          )}
          <p>Questions: {quiz.questions?.length ?? 0}</p>
        </div>
        {!hasRemainingAttempts ? (
          <p className="text-destructive font-medium">
            You have used all your attempts for this quiz.
          </p>
        ) : (
          <Button onClick={startQuiz} size="lg">
            Start Quiz
          </Button>
        )}
      </div>
    );
  }

  const questions = quiz.questions ?? [];
  const currentQuestion = questions[currentQuestionIndex];

  const renderQuestionInput = (question: QuizQuestion) => {
    const value = answers[question.id] ?? "";

    if (question.question_type === "multiple_choice") {
      return (
        <div className="space-y-3">
          {question.options?.map((opt) => (
            <label
              key={opt.id}
              className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={opt.id}
                checked={value === opt.id}
                onChange={() => handleAnswer(question.id, opt.id)}
                className="accent-primary"
              />
              <span>{opt.text}</span>
            </label>
          ))}
        </div>
      );
    }

    if (question.question_type === "true_false") {
      return (
        <div className="space-y-3">
          {["True", "False"].map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border hover:bg-accent transition-colors"
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => handleAnswer(question.id, opt)}
                className="accent-primary"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      );
    }

    if (question.question_type === "short_answer" || question.question_type === "essay") {
      return (
        <textarea
          className="w-full min-h-[120px] p-3 rounded-lg border bg-background resize-y focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Type your answer here..."
          value={value}
          onChange={(e) => handleAnswer(question.id, e.target.value)}
        />
      );
    }

    if (question.question_type === "fill_blank") {
      return (
        <input
          type="text"
          className="w-full p-3 rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Fill in the blank..."
          value={value}
          onChange={(e) => handleAnswer(question.id, e.target.value)}
        />
      );
    }

    return null;
  };

  const answeredCount = Object.keys(answers).length;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left sidebar: question navigator */}
      <aside className="w-56 border-r bg-muted/30 flex flex-col p-4 gap-3 overflow-y-auto shrink-0">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Questions
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              onClick={() => setCurrentQuestionIndex(idx)}
              className={[
                "h-9 w-9 rounded text-sm font-medium transition-colors",
                idx === currentQuestionIndex
                  ? "bg-primary text-primary-foreground"
                  : answers[q.id]
                  ? "bg-green-100 text-green-800 border border-green-300"
                  : "bg-background border hover:bg-accent",
              ].join(" ")}
            >
              {idx + 1}
            </button>
          ))}
        </div>
        <div className="mt-auto text-xs text-muted-foreground">
          {answeredCount} / {questions.length} answered
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
          <h1 className="font-semibold text-lg truncate">{quiz.title}</h1>
          <div className="flex items-center gap-4">
            {timeLeft !== null && (
              <div
                className={[
                  "flex items-center gap-1.5 font-mono text-sm font-medium px-3 py-1 rounded-full",
                  timeLeft < 60
                    ? "bg-red-100 text-red-700"
                    : timeLeft < 300
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                <Clock className="h-4 w-4" />
                {formatTime(timeLeft)}
              </div>
            )}
            <Button
              onClick={() => submitQuiz(answers)}
              disabled={submitting}
              variant="default"
            >
              {submitting ? "Submitting..." : "Submit Quiz"}
            </Button>
          </div>
        </header>

        {/* Question area */}
        <main className="flex-1 overflow-y-auto p-8">
          {currentQuestion ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">
                  Question {currentQuestionIndex + 1} of {questions.length} &middot;{" "}
                  {currentQuestion.points} {currentQuestion.points === 1 ? "point" : "points"}
                </p>
                <h2 className="text-xl font-medium leading-relaxed">
                  {currentQuestion.question_text}
                </h2>
              </div>

              {renderQuestionInput(currentQuestion)}

              <div className="flex justify-between pt-4">
                <Button
                  variant="outline"
                  onClick={() => setCurrentQuestionIndex((i) => Math.max(0, i - 1))}
                  disabled={currentQuestionIndex === 0}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setCurrentQuestionIndex((i) => Math.min(questions.length - 1, i + 1))
                  }
                  disabled={currentQuestionIndex === questions.length - 1}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-center">No questions available.</p>
          )}
        </main>
      </div>
    </div>
  );
}
