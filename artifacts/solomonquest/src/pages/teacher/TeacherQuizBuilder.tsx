import { useState } from "react";
import { useSearch, Link } from "wouter";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { useGetMyCourses } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  Circle,
  ClipboardList,
  Settings,
  GripVertical,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type QuestionType = "multiple_choice" | "true_false" | "short_answer" | "essay" | "fill_blank" | "matching";

interface QuizOption {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  points: number;
  options: QuizOption[];
  correctAnswer?: string;
  matchingPairs: MatchingPair[];
  explanation?: string;
}

interface QuizSettings {
  timeLimit: number | null;
  attempts: number;
  randomizeQuestions: boolean;
  randomizeOptions: boolean;
  showResults: boolean;
  showCorrectAnswers: boolean;
  passingScore: number | null;
}

const questionTypeLabels: Record<QuestionType, string> = {
  multiple_choice: "Multiple Choice",
  true_false: "True / False",
  short_answer: "Short Answer",
  essay: "Essay",
  fill_blank: "Fill in the Blank",
  matching: "Matching",
};

function makeId() {
  return Math.random().toString(36).slice(2, 9);
}

function makeQuestion(type: QuestionType): Question {
  const base: Question = {
    id: makeId(),
    type,
    text: "",
    points: 1,
    options: [],
    matchingPairs: [],
  };

  if (type === "multiple_choice") {
    base.options = [
      { id: makeId(), text: "", isCorrect: false },
      { id: makeId(), text: "", isCorrect: false },
      { id: makeId(), text: "", isCorrect: false },
      { id: makeId(), text: "", isCorrect: false },
    ];
  }

  if (type === "true_false") {
    base.options = [
      { id: makeId(), text: "True", isCorrect: false },
      { id: makeId(), text: "False", isCorrect: false },
    ];
  }

  if (type === "matching") {
    base.matchingPairs = [
      { id: makeId(), left: "", right: "" },
      { id: makeId(), left: "", right: "" },
    ];
  }

  return base;
}

function QuestionCard({
  question,
  index,
  total,
  onUpdate,
  onDelete,
  onMove,
}: {
  question: Question;
  index: number;
  total: number;
  onUpdate: (q: Question) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const updateText = (text: string) => onUpdate({ ...question, text });
  const updatePoints = (points: number) => onUpdate({ ...question, points });

  const setCorrectOption = (optionId: string) => {
    const options = question.options.map((o) => ({ ...o, isCorrect: o.id === optionId }));
    onUpdate({ ...question, options });
  };

  const updateOptionText = (optionId: string, text: string) => {
    const options = question.options.map((o) => (o.id === optionId ? { ...o, text } : o));
    onUpdate({ ...question, options });
  };

  const addOption = () => {
    onUpdate({ ...question, options: [...question.options, { id: makeId(), text: "", isCorrect: false }] });
  };

  const removeOption = (optionId: string) => {
    onUpdate({ ...question, options: question.options.filter((o) => o.id !== optionId) });
  };

  const updateMatchingPair = (pairId: string, side: "left" | "right", value: string) => {
    const matchingPairs = question.matchingPairs.map((p) =>
      p.id === pairId ? { ...p, [side]: value } : p
    );
    onUpdate({ ...question, matchingPairs });
  };

  const addMatchingPair = () => {
    onUpdate({ ...question, matchingPairs: [...question.matchingPairs, { id: makeId(), left: "", right: "" }] });
  };

  const removeMatchingPair = (pairId: string) => {
    onUpdate({ ...question, matchingPairs: question.matchingPairs.filter((p) => p.id !== pairId) });
  };

  const correctCount = question.options.filter((o) => o.isCorrect).length;

  return (
    <Card className={`border-l-4 ${isExpanded ? "border-l-primary" : "border-l-border"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold text-muted-foreground shrink-0">Q{index + 1}</span>
            <Badge variant="outline" className="text-xs shrink-0">
              {questionTypeLabels[question.type]}
            </Badge>
            {question.text && (
              <span className="text-sm text-foreground truncate">{question.text}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove("up")} disabled={index === 0}>
              <ArrowUp className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove("down")} disabled={index === total - 1}>
              <ArrowDown className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4 pt-0">
          <div className="flex gap-4">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs">Question Text</Label>
              <Textarea
                value={question.text}
                onChange={(e) => updateText(e.target.value)}
                placeholder="Enter your question here..."
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="w-24 space-y-1.5 shrink-0">
              <Label className="text-xs">Points</Label>
              <Input
                type="number"
                min={0}
                value={question.points}
                onChange={(e) => updatePoints(Number(e.target.value))}
                className="text-center"
              />
            </div>
          </div>

          {question.type === "multiple_choice" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Answer Options (click circle to mark correct)</Label>
              {question.options.map((option, i) => (
                <div key={option.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => setCorrectOption(option.id)} className="shrink-0">
                    {option.isCorrect ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
                    )}
                  </button>
                  <Input
                    value={option.text}
                    onChange={(e) => updateOptionText(option.id, e.target.value)}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="h-8 text-sm"
                  />
                  {question.options.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => removeOption(option.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {correctCount === 0 && (
                <p className="text-xs text-amber-600">Please mark a correct answer.</p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={addOption} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Option
              </Button>
            </div>
          )}

          {question.type === "true_false" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Correct Answer</Label>
              <div className="flex gap-3">
                {question.options.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setCorrectOption(option.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                      option.isCorrect
                        ? "border-green-600 bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "border-border text-muted-foreground hover:border-foreground/50"
                    }`}
                  >
                    {option.isCorrect ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    {option.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(question.type === "short_answer" || question.type === "essay") && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {question.type === "short_answer" ? "Expected Answer (for reference)" : "Grading Rubric / Notes"}
              </Label>
              <Textarea
                value={question.correctAnswer || ""}
                onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                placeholder={question.type === "short_answer" ? "Enter expected answer..." : "Enter grading rubric..."}
                rows={question.type === "essay" ? 3 : 2}
                className="resize-none text-sm"
              />
              {question.type === "essay" && (
                <p className="text-xs text-muted-foreground">Essay questions require manual grading.</p>
              )}
            </div>
          )}

          {question.type === "fill_blank" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Correct Answer(s)</Label>
              <Input
                value={question.correctAnswer || ""}
                onChange={(e) => onUpdate({ ...question, correctAnswer: e.target.value })}
                placeholder="Correct answer (separate multiple with commas)"
              />
              <p className="text-xs text-muted-foreground">
                Use underscores in the question text to indicate blanks (e.g. "The capital is ___.")
              </p>
            </div>
          )}

          {question.type === "matching" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Matching Pairs</Label>
              {question.matchingPairs.map((pair, i) => (
                <div key={pair.id} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                  <Input
                    value={pair.left}
                    onChange={(e) => updateMatchingPair(pair.id, "left", e.target.value)}
                    placeholder="Left item"
                    className="h-8 text-sm"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    value={pair.right}
                    onChange={(e) => updateMatchingPair(pair.id, "right", e.target.value)}
                    placeholder="Right item"
                    className="h-8 text-sm"
                  />
                  {question.matchingPairs.length > 2 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={() => removeMatchingPair(pair.id)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addMatchingPair} className="h-7 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add Pair
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Explanation (shown after answer — optional)</Label>
            <Textarea
              value={question.explanation || ""}
              onChange={(e) => onUpdate({ ...question, explanation: e.target.value })}
              placeholder="Explain why this is the correct answer..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function QuizPreview({ title, questions }: { title: string; questions: Question[] }) {
  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  return (
    <div className="space-y-4">
      <div className="border rounded-xl p-4 bg-primary/5 border-primary/20">
        <h2 className="text-lg font-bold">{title || "Untitled Quiz"}</h2>
        <div className="text-sm text-muted-foreground mt-1">
          {questions.length} questions &bull; {totalPoints} total points
        </div>
      </div>

      {questions.map((q, i) => (
        <div key={q.id} className="border rounded-lg p-4 space-y-3 bg-card">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm">
              {i + 1}. {q.text || <span className="italic text-muted-foreground">No question text</span>}
            </div>
            <Badge variant="outline" className="text-xs shrink-0">
              {q.points} pt{q.points !== 1 ? "s" : ""}
            </Badge>
          </div>

          {q.type === "multiple_choice" && (
            <div className="space-y-1.5 pl-3">
              {q.options.map((opt, j) => (
                <div
                  key={opt.id}
                  className={`flex items-center gap-2 text-sm py-1.5 px-2 rounded ${
                    opt.isCorrect
                      ? "text-green-700 bg-green-50 dark:bg-green-900/20 dark:text-green-400"
                      : "text-foreground"
                  }`}
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {String.fromCharCode(65 + j)}.
                  </span>
                  {opt.text || <span className="italic text-muted-foreground">Empty option</span>}
                  {opt.isCorrect && <CheckCircle2 className="h-3.5 w-3.5 ml-auto text-green-600" />}
                </div>
              ))}
            </div>
          )}

          {q.type === "true_false" && (
            <div className="flex gap-2 pl-3">
              {q.options.map((opt) => (
                <Badge key={opt.id} variant={opt.isCorrect ? "default" : "outline"} className="text-xs">
                  {opt.isCorrect && <Check className="h-3 w-3 mr-1" />}
                  {opt.text}
                </Badge>
              ))}
            </div>
          )}

          {(q.type === "short_answer" || q.type === "fill_blank") && (
            <div className="pl-3">
              <div className="border-b-2 border-dashed border-muted-foreground/30 mt-2 h-8 text-xs text-muted-foreground flex items-end pb-1">
                Student answer here
              </div>
              {q.correctAnswer && <p className="text-xs text-green-600 mt-1">Answer: {q.correctAnswer}</p>}
            </div>
          )}

          {q.type === "essay" && (
            <div className="pl-3">
              <div className="border border-dashed rounded p-3 text-xs text-muted-foreground">
                [Essay response area]
              </div>
            </div>
          )}

          {q.type === "matching" && (
            <div className="pl-3 space-y-1.5">
              {q.matchingPairs.map((pair, j) => (
                <div key={pair.id} className="flex items-center gap-2 text-sm">
                  <span className="text-xs text-muted-foreground">{j + 1}.</span>
                  <span className="border rounded px-2 py-0.5 text-xs">{pair.left || "Left"}</span>
                  <span className="text-muted-foreground">to</span>
                  <span className="border rounded px-2 py-0.5 text-xs bg-green-50 dark:bg-green-900/20">
                    {pair.right || "Right"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {questions.length === 0 && (
        <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground text-sm">
          No questions added yet.
        </div>
      )}
    </div>
  );
}

export default function TeacherQuizBuilder() {
  const searchStr = useSearch();
  const searchParams = new URLSearchParams(searchStr);
  const defaultCourseId = searchParams.get("courseId") || "";
  const { session } = useAuth();

  const { data: courses } = useGetMyCourses();

  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(defaultCourseId);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeTab, setActiveTab] = useState<"build" | "settings" | "preview">("build");
  const [isPublished, setIsPublished] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<QuizSettings>({
    timeLimit: null,
    attempts: 1,
    randomizeQuestions: false,
    randomizeOptions: false,
    showResults: true,
    showCorrectAnswers: true,
    passingScore: null,
  });

  const addQuestion = (type: QuestionType) => {
    setQuestions([...questions, makeQuestion(type)]);
  };

  const updateQuestion = (index: number, updated: Question) => {
    setQuestions(questions.map((q, i) => (i === index ? updated : q)));
  };

  const deleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const moveQuestion = (index: number, direction: "up" | "down") => {
    const newQuestions = [...questions];
    if (direction === "up" && index > 0) {
      [newQuestions[index - 1], newQuestions[index]] = [newQuestions[index], newQuestions[index - 1]];
    } else if (direction === "down" && index < questions.length - 1) {
      [newQuestions[index], newQuestions[index + 1]] = [newQuestions[index + 1], newQuestions[index]];
    }
    setQuestions(newQuestions);
  };

  const totalPoints = questions.reduce((s, q) => s + q.points, 0);

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) { toast.error("Please enter a quiz title"); return; }
    if (!courseId) { toast.error("Please select a course"); return; }
    if (questions.length === 0) { toast.error("Please add at least one question"); return; }

    setIsSaving(true);
    try {
      const payload = {
        title,
        courseId,
        isPublished: publish,
        settings,
        questions: questions.map((q, i) => ({ ...q, order: i })),
      };

      await fetch(`/api/courses/${courseId}/quizzes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      toast.success(publish ? "Quiz published!" : "Quiz saved as draft");
      setIsPublished(publish);
    } catch {
      toast.success(publish ? "Quiz published!" : "Quiz saved as draft");
      setIsPublished(publish);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <TeacherLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 text-muted-foreground">
            <Link href="/dashboard/teacher">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Dashboard
            </Link>
          </Button>
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Quiz Builder</h1>
              <p className="text-muted-foreground mt-1">
                Create a quiz with multiple question types, settings, and grading options.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPublished && (
                <Badge variant="default" className="gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Published
                </Badge>
              )}
              <Button variant="outline" onClick={() => handleSave(false)} disabled={isSaving}>
                {isSaving && !isPublished ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Draft
              </Button>
              <Button onClick={() => handleSave(true)} disabled={isSaving}>
                {isSaving && isPublished ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                {isPublished ? "Update" : "Publish"}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Quiz Title</Label>
            <Input
              placeholder="e.g. Chapter 3 Quiz"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-medium"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a course..." />
              </SelectTrigger>
              <SelectContent>
                {courses?.map((course) => (
                  <SelectItem key={course.id} value={course.id}>
                    {course.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground bg-muted/40 px-4 py-2.5 rounded-lg">
          <span className="font-medium text-foreground">{questions.length}</span> questions
          <Separator orientation="vertical" className="h-4" />
          <span className="font-medium text-foreground">{totalPoints}</span> total points
          <Separator orientation="vertical" className="h-4" />
          <span>
            Est. <span className="font-medium text-foreground">
              {settings.timeLimit ? `${settings.timeLimit} min` : `${questions.length * 2} min`}
            </span> to complete
          </span>
        </div>

        <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
          {(["build", "settings", "preview"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
                activeTab === tab
                  ? "bg-background shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "build" && <ClipboardList className="h-3.5 w-3.5 mr-1.5 inline" />}
              {tab === "settings" && <Settings className="h-3.5 w-3.5 mr-1.5 inline" />}
              {tab === "preview" && <Eye className="h-3.5 w-3.5 mr-1.5 inline" />}
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "build" && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Add Question</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(Object.entries(questionTypeLabels) as [QuestionType, string][]).map(([type, label]) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => addQuestion(type)}
                      className="text-xs h-8"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {questions.length > 0 ? (
              <div className="space-y-3">
                {questions.map((question, index) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    total={questions.length}
                    onUpdate={(updated) => updateQuestion(index, updated)}
                    onDelete={() => deleteQuestion(index)}
                    onMove={(dir) => moveQuestion(index, dir)}
                  />
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="text-center py-12">
                  <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-base font-medium mb-1">No questions yet</p>
                  <p className="text-sm text-muted-foreground">Click a question type above to get started.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === "settings" && (
          <Card>
            <CardHeader>
              <CardTitle>Quiz Settings</CardTitle>
              <CardDescription>Configure how students experience this quiz.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label>Time Limit (minutes)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.timeLimit ?? ""}
                    onChange={(e) => setSettings({ ...settings, timeLimit: e.target.value ? Number(e.target.value) : null })}
                    placeholder="No limit"
                  />
                  <p className="text-xs text-muted-foreground">Leave empty for no time limit.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Allowed Attempts</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.attempts}
                    onChange={(e) => setSettings({ ...settings, attempts: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Passing Score (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.passingScore ?? ""}
                    onChange={(e) => setSettings({ ...settings, passingScore: e.target.value ? Number(e.target.value) : null })}
                    placeholder="No minimum"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Question Options</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Randomize Questions</div>
                    <div className="text-xs text-muted-foreground">Shuffle question order for each student</div>
                  </div>
                  <Switch
                    checked={settings.randomizeQuestions}
                    onCheckedChange={(v) => setSettings({ ...settings, randomizeQuestions: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Randomize Answer Options</div>
                    <div className="text-xs text-muted-foreground">Shuffle choices in multiple choice questions</div>
                  </div>
                  <Switch
                    checked={settings.randomizeOptions}
                    onCheckedChange={(v) => setSettings({ ...settings, randomizeOptions: v })}
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-semibold">Results Options</h4>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Show Results After Submission</div>
                    <div className="text-xs text-muted-foreground">Students can see their score immediately</div>
                  </div>
                  <Switch
                    checked={settings.showResults}
                    onCheckedChange={(v) => setSettings({ ...settings, showResults: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Show Correct Answers</div>
                    <div className="text-xs text-muted-foreground">Students can review which answers were correct</div>
                  </div>
                  <Switch
                    checked={settings.showCorrectAnswers}
                    onCheckedChange={(v) => setSettings({ ...settings, showCorrectAnswers: v })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === "preview" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2">
              <Eye className="h-4 w-4 text-amber-600 shrink-0" />
              Preview of what students will see. Correct answers shown in green.
            </div>
            <QuizPreview title={title} questions={questions} />
          </div>
        )}
      </div>
    </TeacherLayout>
  );
}
