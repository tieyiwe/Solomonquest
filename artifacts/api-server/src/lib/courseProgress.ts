import { supabaseAdmin } from "./supabase";

/**
 * Course modules / lessons structure, prerequisite locks and per-student
 * completion (tables in course-modules.sql).
 *
 * An item counts toward progress when the student can see it: its module
 * is published and the item itself is published (lesson.is_published,
 * assignment.is_published, quiz.is_published). Completion:
 *   lesson      a lesson_completions row ("Mark complete" / video watched)
 *   assignment  a submissions row with status submitted or graded
 *   quiz        a quiz_attempts row with status submitted or graded
 *
 * Public entry points (used by routes/course-modules.ts and meant for
 * reuse by certificates / at-risk reporting):
 *   getCourseProgress(studentId, courseId)
 *   getCourseProgressForStudents(courseId, studentIds)
 *   getStudentCourseState(courseId, studentId)
 *   getItemLockForStudent(courseId, studentId, target)
 */

export type ModuleItemType = "lesson" | "assignment" | "quiz";
export type PrerequisiteMode = "none" | "previous" | "module";

export interface CourseProgress {
  /** 0–100, rounded. 0 when the course has no visible items. */
  percent: number;
  completedItems: number;
  totalItems: number;
  /** ISO timestamp of the last item completed, once every item is complete; else null. */
  completedAt: string | null;
}

export interface StructureItem {
  id: string;
  moduleId: string;
  itemType: ModuleItemType;
  /** lesson / assignment / quiz id the item points at */
  targetId: string;
  lessonId: string | null;
  assignmentId: string | null;
  quizId: string | null;
  position: number;
  isSequential: boolean;
  title: string;
  /** Whether the target itself is published (lesson / assignment / quiz). */
  isPublished: boolean;
  dueDate: string | null;
  /** lesson only */
  hasVideo: boolean;
  requireVideoWatch: boolean;
}

export interface StructureModule {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  isPublished: boolean;
  prerequisiteMode: PrerequisiteMode;
  prerequisiteModuleId: string | null;
  items: StructureItem[];
}

export interface ItemState extends StructureItem {
  completed: boolean;
  completedAt: string | null;
  locked: boolean;
  lockReason: string | null;
}

export interface ModuleState extends Omit<StructureModule, "items"> {
  items: ItemState[];
  completed: boolean;
  locked: boolean;
  lockReason: string | null;
  completedItems: number;
  totalItems: number;
}

export interface StudentCourseState {
  modules: ModuleState[];
  progress: CourseProgress;
}

/** completion timestamps keyed by "<type>:<targetId>" */
type CompletionMap = Map<string, string>;

const key = (type: ModuleItemType, id: string) => `${type}:${id}`;

/**
 * Loads a course's modules and items (ordered), with each item's title and
 * published state resolved from its lesson / assignment / quiz. With
 * visibleOnly, drops unpublished modules and unpublished items — what a
 * student sees and what progress is computed over.
 */
export async function loadCourseStructure(
  courseId: string,
  opts: { visibleOnly: boolean }
): Promise<StructureModule[]> {
  const { data: moduleRows, error: modErr } = await supabaseAdmin
    .from("course_modules")
    .select("id, course_id, title, description, position, is_published, prerequisite_mode, prerequisite_module_id, created_at")
    .eq("course_id", courseId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (modErr) throw new Error(modErr.message);

  const modules = (moduleRows ?? []).filter((m) => !opts.visibleOnly || m.is_published === true);
  if (modules.length === 0) return [];

  const { data: itemRows, error: itemErr } = await supabaseAdmin
    .from("course_module_items")
    .select("id, module_id, item_type, lesson_id, assignment_id, quiz_id, position, is_sequential, created_at")
    .eq("course_id", courseId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemErr) throw new Error(itemErr.message);

  const items = itemRows ?? [];
  const lessonIds = items.filter((i) => i.lesson_id).map((i) => i.lesson_id as string);
  const assignmentIds = items.filter((i) => i.assignment_id).map((i) => i.assignment_id as string);
  const quizIds = items.filter((i) => i.quiz_id).map((i) => i.quiz_id as string);

  const [lessonsRes, assignmentsRes, quizzesRes] = await Promise.all([
    lessonIds.length
      ? supabaseAdmin.from("course_lessons").select("id, title, is_published, video_url, require_video_watch").in("id", lessonIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    assignmentIds.length
      ? supabaseAdmin.from("assignments").select("id, title, is_published, due_date").in("id", assignmentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    quizIds.length
      ? supabaseAdmin.from("quizzes").select("id, title, is_published, due_date").in("id", quizIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);

  const lessonById = new Map((lessonsRes.data ?? []).map((r) => [r.id as string, r as Record<string, unknown>]));
  const assignmentById = new Map((assignmentsRes.data ?? []).map((r) => [r.id as string, r as Record<string, unknown>]));
  const quizById = new Map((quizzesRes.data ?? []).map((r) => [r.id as string, r as Record<string, unknown>]));

  const itemsByModule = new Map<string, StructureItem[]>();
  for (const i of items) {
    const type = i.item_type as ModuleItemType;
    const targetId = (i.lesson_id ?? i.assignment_id ?? i.quiz_id) as string;
    const target =
      type === "lesson" ? lessonById.get(targetId) : type === "assignment" ? assignmentById.get(targetId) : quizById.get(targetId);
    if (!target) continue; // dangling reference
    const isPublished = target.is_published === true;
    if (opts.visibleOnly && !isPublished) continue;
    const list = itemsByModule.get(i.module_id as string) ?? [];
    list.push({
      id: i.id as string,
      moduleId: i.module_id as string,
      itemType: type,
      targetId,
      lessonId: (i.lesson_id as string | null) ?? null,
      assignmentId: (i.assignment_id as string | null) ?? null,
      quizId: (i.quiz_id as string | null) ?? null,
      position: (i.position as number) ?? 0,
      isSequential: i.is_sequential === true,
      title: (target.title as string) ?? "Untitled",
      isPublished,
      dueDate: (target.due_date as string | null | undefined) ?? null,
      hasVideo: type === "lesson" && !!target.video_url,
      requireVideoWatch: type === "lesson" && target.require_video_watch === true,
    });
    itemsByModule.set(i.module_id as string, list);
  }

  return modules.map((m) => ({
    id: m.id as string,
    courseId: m.course_id as string,
    title: m.title as string,
    description: (m.description as string | null) ?? null,
    position: (m.position as number) ?? 0,
    isPublished: m.is_published === true,
    prerequisiteMode: ((m.prerequisite_mode as PrerequisiteMode) ?? "none"),
    prerequisiteModuleId: (m.prerequisite_module_id as string | null) ?? null,
    items: itemsByModule.get(m.id as string) ?? [],
  }));
}

/** Completion timestamps for many students over one course's structure. */
async function loadCompletions(
  courseId: string,
  modules: StructureModule[],
  studentIds: string[]
): Promise<Map<string, CompletionMap>> {
  const byStudent = new Map<string, CompletionMap>();
  for (const s of studentIds) byStudent.set(s, new Map());
  if (studentIds.length === 0) return byStudent;

  const all = modules.flatMap((m) => m.items);
  const assignmentIds = all.filter((i) => i.itemType === "assignment").map((i) => i.targetId);
  const quizIds = all.filter((i) => i.itemType === "quiz").map((i) => i.targetId);
  const hasLessons = all.some((i) => i.itemType === "lesson");

  const [lessonRes, subRes, attemptRes] = await Promise.all([
    hasLessons
      ? supabaseAdmin
          .from("lesson_completions")
          .select("lesson_id, student_id, completed_at")
          .eq("course_id", courseId)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    assignmentIds.length
      ? supabaseAdmin
          .from("submissions")
          .select("assignment_id, student_id, submitted_at, status")
          .in("assignment_id", assignmentIds)
          .in("student_id", studentIds)
          .in("status", ["submitted", "graded"])
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
    quizIds.length
      ? supabaseAdmin
          .from("quiz_attempts")
          .select("quiz_id, student_id, submitted_at, status")
          .in("quiz_id", quizIds)
          .in("student_id", studentIds)
          .in("status", ["submitted", "graded"])
      : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
  ]);
  if (lessonRes.error) throw new Error(lessonRes.error.message);
  if (subRes.error) throw new Error(subRes.error.message);
  if (attemptRes.error) throw new Error(attemptRes.error.message);

  const put = (studentId: string, k: string, at: unknown) => {
    const map = byStudent.get(studentId);
    if (!map) return;
    const ts = typeof at === "string" && at ? at : new Date(0).toISOString();
    const prev = map.get(k);
    // Earliest completion wins (first submission / first finished attempt).
    if (!prev || ts < prev) map.set(k, ts);
  };
  for (const r of lessonRes.data ?? []) put(r.student_id as string, key("lesson", r.lesson_id as string), r.completed_at);
  for (const r of subRes.data ?? []) put(r.student_id as string, key("assignment", r.assignment_id as string), r.submitted_at);
  for (const r of attemptRes.data ?? []) put(r.student_id as string, key("quiz", r.quiz_id as string), r.submitted_at);
  return byStudent;
}

/** Pure: applies completions + prerequisite rules to a visible structure. */
export function computeStudentState(modules: StructureModule[], completions: CompletionMap): StudentCourseState {
  const states: ModuleState[] = [];
  const completeById = new Map<string, boolean>();
  const titleById = new Map(modules.map((m) => [m.id, m.title]));
  let total = 0;
  let done = 0;
  let lastAt: string | null = null;

  modules.forEach((m, idx) => {
    let locked = false;
    let lockReason: string | null = null;
    if (m.prerequisiteMode === "previous" && idx > 0) {
      const prev = modules[idx - 1];
      if (!completeById.get(prev.id)) {
        locked = true;
        lockReason = `Complete “${prev.title}” to unlock this module`;
      }
    } else if (m.prerequisiteMode === "module" && m.prerequisiteModuleId && m.prerequisiteModuleId !== m.id) {
      // Only enforce prerequisites the student can actually see/complete.
      if (titleById.has(m.prerequisiteModuleId)) {
        const prereqDone =
          completeById.get(m.prerequisiteModuleId) ??
          // prerequisite placed later in the order: evaluate its items directly
          (modules.find((x) => x.id === m.prerequisiteModuleId)?.items ?? []).every((i) =>
            completions.has(key(i.itemType, i.targetId))
          );
        if (!prereqDone) {
          locked = true;
          lockReason = `Complete “${titleById.get(m.prerequisiteModuleId)}” to unlock this module`;
        }
      }
    }

    const items: ItemState[] = [];
    let prevItem: ItemState | null = null;
    for (const item of m.items) {
      const completedAt = completions.get(key(item.itemType, item.targetId)) ?? null;
      const completed = completedAt !== null;
      let itemLocked = false;
      let itemReason: string | null = null;
      if (!completed) {
        if (locked) {
          itemLocked = true;
          itemReason = lockReason;
        } else if (item.isSequential && prevItem && !prevItem.completed) {
          itemLocked = true;
          itemReason = `Complete “${prevItem.title}” first`;
        }
      }
      const s: ItemState = { ...item, completed, completedAt, locked: itemLocked, lockReason: itemReason };
      items.push(s);
      prevItem = s;
      total += 1;
      if (completed) {
        done += 1;
        if (!lastAt || completedAt! > lastAt) lastAt = completedAt;
      }
    }

    const moduleDone = items.every((i) => i.completed);
    completeById.set(m.id, moduleDone);
    states.push({
      ...m,
      items,
      completed: moduleDone,
      locked,
      lockReason,
      completedItems: items.filter((i) => i.completed).length,
      totalItems: items.length,
    });
  });

  return {
    modules: states,
    progress: {
      percent: total > 0 ? Math.round((done / total) * 100) : 0,
      completedItems: done,
      totalItems: total,
      completedAt: total > 0 && done === total ? lastAt : null,
    },
  };
}

/** Full per-student view of a course: modules, items, completion and locks. */
export async function getStudentCourseState(courseId: string, studentId: string): Promise<StudentCourseState> {
  const modules = await loadCourseStructure(courseId, { visibleOnly: true });
  const completions = await loadCompletions(courseId, modules, [studentId]);
  return computeStudentState(modules, completions.get(studentId) ?? new Map());
}

/**
 * Course completion for one student.
 * Does NOT check enrollment or caller permissions — the caller must.
 */
export async function getCourseProgress(studentId: string, courseId: string): Promise<CourseProgress> {
  return (await getStudentCourseState(courseId, studentId)).progress;
}

/** Batched course completion for many students (one structure load). */
export async function getCourseProgressForStudents(
  courseId: string,
  studentIds: string[]
): Promise<Map<string, CourseProgress>> {
  const modules = await loadCourseStructure(courseId, { visibleOnly: true });
  const completions = await loadCompletions(courseId, modules, studentIds);
  const out = new Map<string, CourseProgress>();
  for (const s of studentIds) out.set(s, computeStudentState(modules, completions.get(s) ?? new Map()).progress);
  return out;
}

/**
 * Lock check for one lesson / assignment / quiz. Returns null when the
 * target isn't placed in any visible module (so it isn't gated at all),
 * otherwise whether it's locked for this student and why.
 */
export async function getItemLockForStudent(
  courseId: string,
  studentId: string,
  target: { type: ModuleItemType; id: string }
): Promise<{ locked: boolean; reason: string | null; item: ItemState; state: StudentCourseState } | null> {
  const state = await getStudentCourseState(courseId, studentId);
  for (const m of state.modules) {
    for (const i of m.items) {
      if (i.itemType === target.type && i.targetId === target.id) {
        return { locked: i.locked, reason: i.lockReason, item: i, state };
      }
    }
  }
  return null;
}

/**
 * Guard for existing assignment / quiz routes: returns an error message
 * when the target sits in a module item that is locked for this student,
 * else null. Fails OPEN on a lookup error (e.g. course-modules.sql not yet
 * applied) so submissions/quiz attempts keep working without modules.
 */
export async function lockedItemError(
  courseId: string,
  studentId: string,
  target: { type: ModuleItemType; id: string }
): Promise<string | null> {
  try {
    const lock = await getItemLockForStudent(courseId, studentId, target);
    return lock?.locked ? lock.reason ?? "This item is locked" : null;
  } catch {
    return null;
  }
}
