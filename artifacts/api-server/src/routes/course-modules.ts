import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { maybeIssueCertificate } from "../lib/certificates";
import {
  loadCourseStructure,
  getStudentCourseState,
  getCourseProgressForStudents,
  getItemLockForStudent,
  type PrerequisiteMode,
} from "../lib/courseProgress";

/**
 * Course modules & lessons (course-modules.sql).
 *
 *   GET    /courses/:courseId/modules          structure (+ student state)
 *   POST   /courses/:courseId/modules          create module
 *   PUT    /courses/:courseId/modules/order    reorder modules { moduleIds }
 *   PATCH  /modules/:id                        rename / publish / prerequisite
 *   DELETE /modules/:id
 *   POST   /modules/:id/lessons                create lesson (+ its module item)
 *   POST   /modules/:id/items                  attach assignment / quiz
 *   PUT    /modules/:id/items/order            reorder items { itemIds }
 *   PATCH  /module-items/:id                   { isSequential }
 *   DELETE /module-items/:id                   (a lesson item deletes the lesson)
 *   GET    /lessons/:id                        403 for a student while locked
 *   PATCH  /lessons/:id
 *   DELETE /lessons/:id
 *   POST   /lessons/:id/complete               student: mark complete
 *   DELETE /lessons/:id/complete               student: undo
 *   GET    /courses/:courseId/progress         manager: per-student table; student: own
 *   GET    /progress/my                        student: progress for every enrolled course
 *
 * Every route resolves the course first and applies the same access rule
 * as quizzes.ts: super_admin always; admin same school; teacher must teach
 * the course; anyone else must be actively enrolled (read-only).
 */

const router: IRouter = Router();

type Access = { ok: true; isManager: boolean; schoolId: string | null } | { ok: false; status: number; error: string };

// Same rule as quizzes.ts assertCourseAccess.
async function assertCourseAccess(courseId: string, userId: string | undefined, role: string | undefined): Promise<Access> {
  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("teacher_id, school_id")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { ok: false, status: 404, error: "Course not found" };
  const schoolId = (course.school_id as string | null) ?? null;

  if (role === "super_admin") return { ok: true, isManager: true, schoolId };

  if (role === "admin") {
    const { data: caller } = await supabaseAdmin.from("profiles").select("school_id").eq("id", userId ?? "").maybeSingle();
    if (caller?.school_id === course.school_id) return { ok: true, isManager: true, schoolId };
    return { ok: false, status: 403, error: "Forbidden" };
  }

  if (role === "teacher") {
    if (course.teacher_id === userId) return { ok: true, isManager: true, schoolId };
    return { ok: false, status: 403, error: "You do not teach this course" };
  }

  const { data: enrollment } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("course_id", courseId)
    .eq("student_id", userId ?? "")
    .eq("status", "active")
    .maybeSingle();
  if (!enrollment) return { ok: false, status: 403, error: "You are not enrolled in this course" };
  return { ok: true, isManager: false, schoolId };
}

async function assertManager(courseId: string, req: AuthenticatedRequest): Promise<Access> {
  const access = await assertCourseAccess(courseId, req.userId, req.userRole);
  if (access.ok && !access.isManager) return { ok: false, status: 403, error: "Forbidden" };
  return access;
}

const param = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function mapModule(m: Record<string, unknown>) {
  return {
    id: m.id,
    courseId: m.course_id,
    title: m.title,
    description: m.description ?? null,
    position: m.position ?? 0,
    isPublished: m.is_published === true,
    prerequisiteMode: m.prerequisite_mode ?? "none",
    prerequisiteModuleId: m.prerequisite_module_id ?? null,
    createdAt: m.created_at ?? null,
    updatedAt: m.updated_at ?? null,
  };
}

interface Attachment {
  name: string;
  url: string;
  size: number | null;
  contentType: string | null;
}

function mapLesson(l: Record<string, unknown>, item?: Record<string, unknown> | null) {
  return {
    id: l.id,
    courseId: l.course_id,
    moduleId: l.module_id,
    itemId: item?.id ?? null,
    isSequential: item?.is_sequential === true,
    title: l.title,
    body: l.body ?? "",
    videoUrl: l.video_url ?? null,
    requireVideoWatch: l.require_video_watch === true,
    attachments: Array.isArray(l.attachments) ? (l.attachments as Attachment[]) : [],
    isPublished: l.is_published === true,
    createdAt: l.created_at ?? null,
    updatedAt: l.updated_at ?? null,
  };
}

function validateVideoUrl(v: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  if (typeof v !== "string" || v.length > 2000) return { ok: false, error: "videoUrl must be a URL" };
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "videoUrl must be an http(s) URL" };
    return { ok: true, value: u.toString() };
  } catch {
    return { ok: false, error: "videoUrl must be a valid URL" };
  }
}

/** Only files uploaded into this course's folder of the course-resources bucket. */
function validateAttachments(courseId: string, v: unknown): { ok: true; value: Attachment[] } | { ok: false; error: string } {
  if (v === undefined || v === null) return { ok: true, value: [] };
  if (!Array.isArray(v) || v.length > 20) return { ok: false, error: "attachments must be a list of at most 20 files" };
  const { data } = supabaseAdmin.storage.from("course-resources").getPublicUrl(`courses/${courseId}/`);
  const prefix = data.publicUrl;
  const out: Attachment[] = [];
  for (const a of v) {
    if (!a || typeof a !== "object") return { ok: false, error: "Invalid attachment" };
    const { name, url, size, contentType } = a as Record<string, unknown>;
    if (typeof url !== "string" || !url.startsWith(prefix) || url.includes("..")) {
      return { ok: false, error: "Attachments must be uploaded to this course's files" };
    }
    out.push({
      name: typeof name === "string" && name ? name.slice(0, 255) : url.split("/").pop() ?? "file",
      url,
      size: typeof size === "number" && Number.isFinite(size) ? size : null,
      contentType: typeof contentType === "string" ? contentType.slice(0, 120) : null,
    });
  }
  return { ok: true, value: out };
}

async function validatePrerequisite(
  courseId: string,
  moduleId: string | null,
  mode: unknown,
  prereqId: unknown
): Promise<{ ok: true; mode: PrerequisiteMode; prereqId: string | null } | { ok: false; error: string }> {
  const m = (mode ?? "none") as PrerequisiteMode;
  if (!["none", "previous", "module"].includes(m)) return { ok: false, error: "prerequisiteMode must be none, previous or module" };
  if (m !== "module") return { ok: true, mode: m, prereqId: null };
  if (typeof prereqId !== "string" || !prereqId) return { ok: false, error: "prerequisiteModuleId is required" };
  if (moduleId && prereqId === moduleId) return { ok: false, error: "A module cannot require itself" };
  const { data } = await supabaseAdmin
    .from("course_modules")
    .select("id")
    .eq("id", prereqId)
    .eq("course_id", courseId)
    .maybeSingle();
  if (!data) return { ok: false, error: "Prerequisite module not found in this course" };
  return { ok: true, mode: m, prereqId };
}

async function getModuleRow(id: string) {
  const { data } = await supabaseAdmin.from("course_modules").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function nextItemPosition(moduleId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("course_module_items")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1);
  return ((data?.[0]?.position as number | undefined) ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

router.get("/courses/:courseId/modules", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = param(req.params.courseId);
  const access = await assertCourseAccess(courseId, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  try {
    if (access.isManager) {
      const modules = await loadCourseStructure(courseId, { visibleOnly: false });
      res.json({ isManager: true, modules, progress: null });
      return;
    }
    const state = await getStudentCourseState(courseId, req.userId ?? "");
    res.json({ isManager: false, modules: state.modules, progress: state.progress });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/courses/:courseId/modules", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = param(req.params.courseId);
  const access = await assertManager(courseId, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { title, description, isPublished, prerequisiteMode, prerequisiteModuleId } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const prereq = await validatePrerequisite(courseId, null, prerequisiteMode, prerequisiteModuleId);
  if (!prereq.ok) {
    res.status(400).json({ error: prereq.error });
    return;
  }
  const { data: last } = await supabaseAdmin
    .from("course_modules")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1);
  const position = ((last?.[0]?.position as number | undefined) ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from("course_modules")
    .insert({
      course_id: courseId,
      title: title.trim().slice(0, 200),
      description: typeof description === "string" ? description : null,
      position,
      is_published: isPublished === true,
      prerequisite_mode: prereq.mode,
      prerequisite_module_id: prereq.prereqId,
      created_by: req.userId,
    })
    .select()
    .single();
  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to create module" });
    return;
  }
  res.status(201).json(mapModule(data));
});

router.put("/courses/:courseId/modules/order", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = param(req.params.courseId);
  const access = await assertManager(courseId, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const moduleIds = (req.body ?? {}).moduleIds;
  if (!Array.isArray(moduleIds) || moduleIds.some((x) => typeof x !== "string")) {
    res.status(400).json({ error: "moduleIds must be a list of module ids" });
    return;
  }
  const { data: rows } = await supabaseAdmin.from("course_modules").select("id").eq("course_id", courseId);
  const own = new Set((rows ?? []).map((r) => r.id as string));
  if (moduleIds.length !== own.size || moduleIds.some((id: string) => !own.has(id))) {
    res.status(400).json({ error: "moduleIds must list every module of this course exactly once" });
    return;
  }
  const results = await Promise.all(
    moduleIds.map((id: string, idx: number) =>
      supabaseAdmin.from("course_modules").update({ position: idx, updated_at: new Date().toISOString() }).eq("id", id).eq("course_id", courseId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    res.status(500).json({ error: failed.error.message });
    return;
  }
  res.json({ ok: true });
});

router.patch("/modules/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const mod = await getModuleRow(id);
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  const courseId = mod.course_id as string;
  const access = await assertManager(courseId, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { title, description, isPublished, prerequisiteMode, prerequisiteModuleId } = req.body ?? {};
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "title cannot be empty" });
      return;
    }
    updates.title = title.trim().slice(0, 200);
  }
  if (description !== undefined) updates.description = typeof description === "string" ? description : null;
  if (isPublished !== undefined) updates.is_published = isPublished === true;
  if (prerequisiteMode !== undefined) {
    const prereq = await validatePrerequisite(courseId, id, prerequisiteMode, prerequisiteModuleId);
    if (!prereq.ok) {
      res.status(400).json({ error: prereq.error });
      return;
    }
    updates.prerequisite_mode = prereq.mode;
    updates.prerequisite_module_id = prereq.prereqId;
  }
  const { data, error } = await supabaseAdmin.from("course_modules").update(updates).eq("id", id).select().single();
  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to update module" });
    return;
  }
  res.json(mapModule(data));
});

router.delete("/modules/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const mod = await getModuleRow(id);
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  const access = await assertManager(mod.course_id as string, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { error } = await supabaseAdmin.from("course_modules").delete().eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Module items
// ---------------------------------------------------------------------------

router.post("/modules/:id/lessons", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const moduleId = param(req.params.id);
  const mod = await getModuleRow(moduleId);
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  const courseId = mod.course_id as string;
  const access = await assertManager(courseId, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { title, body, videoUrl, requireVideoWatch, attachments, isPublished, isSequential } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const video = validateVideoUrl(videoUrl);
  if (!video.ok) {
    res.status(400).json({ error: video.error });
    return;
  }
  const files = validateAttachments(courseId, attachments);
  if (!files.ok) {
    res.status(400).json({ error: files.error });
    return;
  }

  const { data: lesson, error } = await supabaseAdmin
    .from("course_lessons")
    .insert({
      course_id: courseId,
      module_id: moduleId,
      title: title.trim().slice(0, 200),
      body: typeof body === "string" ? body : null,
      video_url: video.value,
      require_video_watch: requireVideoWatch === true && !!video.value,
      attachments: files.value,
      is_published: isPublished === true,
      created_by: req.userId,
    })
    .select()
    .single();
  if (error || !lesson) {
    res.status(400).json({ error: error?.message ?? "Failed to create lesson" });
    return;
  }

  const { data: item, error: itemErr } = await supabaseAdmin
    .from("course_module_items")
    .insert({
      course_id: courseId,
      module_id: moduleId,
      item_type: "lesson",
      lesson_id: lesson.id,
      position: await nextItemPosition(moduleId),
      is_sequential: isSequential === true,
    })
    .select()
    .single();
  if (itemErr || !item) {
    await supabaseAdmin.from("course_lessons").delete().eq("id", lesson.id);
    res.status(400).json({ error: itemErr?.message ?? "Failed to add lesson to module" });
    return;
  }
  res.status(201).json(mapLesson(lesson, item));
});

router.post("/modules/:id/items", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const moduleId = param(req.params.id);
  const mod = await getModuleRow(moduleId);
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  const courseId = mod.course_id as string;
  const access = await assertManager(courseId, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { itemType, assignmentId, quizId, isSequential } = req.body ?? {};
  if (itemType !== "assignment" && itemType !== "quiz") {
    res.status(400).json({ error: "itemType must be assignment or quiz (create lessons via /modules/:id/lessons)" });
    return;
  }
  const targetId = itemType === "assignment" ? assignmentId : quizId;
  if (typeof targetId !== "string" || !targetId) {
    res.status(400).json({ error: `${itemType === "assignment" ? "assignmentId" : "quizId"} is required` });
    return;
  }
  // The target must belong to this same course — never link another
  // course's (or school's) assignment/quiz by id.
  const { data: target } = await supabaseAdmin
    .from(itemType === "assignment" ? "assignments" : "quizzes")
    .select("id, course_id")
    .eq("id", targetId)
    .maybeSingle();
  if (!target || target.course_id !== courseId) {
    res.status(400).json({ error: `That ${itemType} is not in this course` });
    return;
  }
  const { data: dup } = await supabaseAdmin
    .from("course_module_items")
    .select("id")
    .eq("module_id", moduleId)
    .eq(itemType === "assignment" ? "assignment_id" : "quiz_id", targetId)
    .maybeSingle();
  if (dup) {
    res.status(409).json({ error: `That ${itemType} is already in this module` });
    return;
  }

  const { data, error } = await supabaseAdmin
    .from("course_module_items")
    .insert({
      course_id: courseId,
      module_id: moduleId,
      item_type: itemType,
      assignment_id: itemType === "assignment" ? targetId : null,
      quiz_id: itemType === "quiz" ? targetId : null,
      position: await nextItemPosition(moduleId),
      is_sequential: isSequential === true,
    })
    .select()
    .single();
  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to add item" });
    return;
  }
  res.status(201).json({
    id: data.id,
    moduleId: data.module_id,
    itemType: data.item_type,
    assignmentId: data.assignment_id ?? null,
    quizId: data.quiz_id ?? null,
    position: data.position,
    isSequential: data.is_sequential === true,
  });
});

router.put("/modules/:id/items/order", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const moduleId = param(req.params.id);
  const mod = await getModuleRow(moduleId);
  if (!mod) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  const access = await assertManager(mod.course_id as string, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const itemIds = (req.body ?? {}).itemIds;
  if (!Array.isArray(itemIds) || itemIds.some((x) => typeof x !== "string")) {
    res.status(400).json({ error: "itemIds must be a list of item ids" });
    return;
  }
  const { data: rows } = await supabaseAdmin.from("course_module_items").select("id").eq("module_id", moduleId);
  const own = new Set((rows ?? []).map((r) => r.id as string));
  if (itemIds.length !== own.size || itemIds.some((id: string) => !own.has(id))) {
    res.status(400).json({ error: "itemIds must list every item of this module exactly once" });
    return;
  }
  const results = await Promise.all(
    itemIds.map((id: string, idx: number) =>
      supabaseAdmin.from("course_module_items").update({ position: idx }).eq("id", id).eq("module_id", moduleId)
    )
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    res.status(500).json({ error: failed.error.message });
    return;
  }
  res.json({ ok: true });
});

async function getItemRow(id: string) {
  const { data } = await supabaseAdmin.from("course_module_items").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

router.patch("/module-items/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const item = await getItemRow(id);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const access = await assertManager(item.course_id as string, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { isSequential } = req.body ?? {};
  if (typeof isSequential !== "boolean") {
    res.status(400).json({ error: "isSequential must be true or false" });
    return;
  }
  const { data, error } = await supabaseAdmin
    .from("course_module_items")
    .update({ is_sequential: isSequential })
    .eq("id", id)
    .select()
    .single();
  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to update item" });
    return;
  }
  res.json({ id: data.id, isSequential: data.is_sequential === true });
});

router.delete("/module-items/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const item = await getItemRow(id);
  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }
  const access = await assertManager(item.course_id as string, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  // A lesson exists only inside its module, so removing the item removes
  // the lesson (cascading the item). Assignment/quiz links just unlink.
  const { error } =
    item.item_type === "lesson" && item.lesson_id
      ? await supabaseAdmin.from("course_lessons").delete().eq("id", item.lesson_id as string)
      : await supabaseAdmin.from("course_module_items").delete().eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.sendStatus(204);
});

// ---------------------------------------------------------------------------
// Lessons
// ---------------------------------------------------------------------------

async function getLessonRow(id: string) {
  const { data } = await supabaseAdmin.from("course_lessons").select("*").eq("id", id).maybeSingle();
  return data as Record<string, unknown> | null;
}

router.get("/lessons/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const lesson = await getLessonRow(id);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const courseId = lesson.course_id as string;
  const access = await assertCourseAccess(courseId, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { data: item } = await supabaseAdmin
    .from("course_module_items")
    .select("*")
    .eq("lesson_id", id)
    .maybeSingle();

  if (access.isManager) {
    res.json({ ...mapLesson(lesson, item), completed: false, completedAt: null, locked: false, lockReason: null });
    return;
  }

  try {
    // getItemLockForStudent only sees published lessons in published
    // modules, so null here means "not visible to students".
    const lock = await getItemLockForStudent(courseId, req.userId ?? "", { type: "lesson", id });
    if (!lock) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    if (lock.locked) {
      res.status(403).json({ error: lock.reason ?? "This lesson is locked", locked: true, lockReason: lock.reason });
      return;
    }
    res.json({
      ...mapLesson(lesson, item),
      completed: lock.item.completed,
      completedAt: lock.item.completedAt,
      locked: false,
      lockReason: null,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.patch("/lessons/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const lesson = await getLessonRow(id);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const courseId = lesson.course_id as string;
  const access = await assertManager(courseId, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { title, body, videoUrl, requireVideoWatch, attachments, isPublished, isSequential } = req.body ?? {};
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim()) {
      res.status(400).json({ error: "title cannot be empty" });
      return;
    }
    updates.title = title.trim().slice(0, 200);
  }
  if (body !== undefined) updates.body = typeof body === "string" ? body : null;
  let finalVideo = (lesson.video_url as string | null) ?? null;
  if (videoUrl !== undefined) {
    const video = validateVideoUrl(videoUrl);
    if (!video.ok) {
      res.status(400).json({ error: video.error });
      return;
    }
    updates.video_url = video.value;
    finalVideo = video.value;
  }
  if (requireVideoWatch !== undefined || videoUrl !== undefined) {
    const want = requireVideoWatch !== undefined ? requireVideoWatch === true : lesson.require_video_watch === true;
    updates.require_video_watch = want && !!finalVideo;
  }
  if (attachments !== undefined) {
    const files = validateAttachments(courseId, attachments);
    if (!files.ok) {
      res.status(400).json({ error: files.error });
      return;
    }
    updates.attachments = files.value;
  }
  if (isPublished !== undefined) updates.is_published = isPublished === true;

  const { data, error } = await supabaseAdmin.from("course_lessons").update(updates).eq("id", id).select().single();
  if (error || !data) {
    res.status(400).json({ error: error?.message ?? "Failed to update lesson" });
    return;
  }
  if (typeof isSequential === "boolean") {
    await supabaseAdmin.from("course_module_items").update({ is_sequential: isSequential }).eq("lesson_id", id);
  }
  const { data: item } = await supabaseAdmin.from("course_module_items").select("*").eq("lesson_id", id).maybeSingle();
  res.json(mapLesson(data, item));
});

router.delete("/lessons/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const lesson = await getLessonRow(id);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const access = await assertManager(lesson.course_id as string, req);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { error } = await supabaseAdmin.from("course_lessons").delete().eq("id", id);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.sendStatus(204);
});

router.post("/lessons/:id/complete", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const lesson = await getLessonRow(id);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const courseId = lesson.course_id as string;
  const access = await assertCourseAccess(courseId, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  if (access.isManager) {
    res.status(403).json({ error: "Only enrolled students record lesson completion" });
    return;
  }
  try {
    const lock = await getItemLockForStudent(courseId, req.userId ?? "", { type: "lesson", id });
    if (!lock) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    if (lock.locked) {
      res.status(403).json({ error: lock.reason ?? "This lesson is locked", locked: true, lockReason: lock.reason });
      return;
    }
    const source = (req.body ?? {}).source === "video" ? "video" : "manual";
    const { error } = await supabaseAdmin
      .from("lesson_completions")
      .upsert(
        { lesson_id: id, course_id: courseId, student_id: req.userId, source },
        { onConflict: "lesson_id,student_id", ignoreDuplicates: true }
      );
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const state = await getStudentCourseState(courseId, req.userId ?? "");
    // Finishing the last lesson can complete the course: let the school's
    // certificate settings (auto mode only) decide whether to issue one.
    if (state.progress.totalItems > 0 && state.progress.completedItems >= state.progress.totalItems) {
      void maybeIssueCertificate(req.userId ?? "", courseId);
    }
    res.json({ lessonId: id, completed: true, progress: state.progress });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete("/lessons/:id/complete", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const id = param(req.params.id);
  const lesson = await getLessonRow(id);
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const courseId = lesson.course_id as string;
  const access = await assertCourseAccess(courseId, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  const { error } = await supabaseAdmin
    .from("lesson_completions")
    .delete()
    .eq("lesson_id", id)
    .eq("student_id", req.userId ?? "");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  const state = await getStudentCourseState(courseId, req.userId ?? "");
  res.json({ lessonId: id, completed: false, progress: state.progress });
});

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

router.get("/courses/:courseId/progress", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const courseId = param(req.params.courseId);
  const access = await assertCourseAccess(courseId, req.userId, req.userRole);
  if (!access.ok) {
    res.status(access.status).json({ error: access.error });
    return;
  }
  try {
    if (!access.isManager) {
      const state = await getStudentCourseState(courseId, req.userId ?? "");
      res.json({ courseId, ...state.progress });
      return;
    }
    const { data: enrollments, error } = await supabaseAdmin
      .from("course_enrollments")
      .select("student_id")
      .eq("course_id", courseId)
      .eq("status", "active");
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    const studentIds = (enrollments ?? []).map((e) => e.student_id as string);
    if (studentIds.length === 0) {
      res.json({ courseId, students: [] });
      return;
    }
    const [{ data: profiles }, progressById] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, first_name, last_name, email, avatar_url, role").in("id", studentIds),
      getCourseProgressForStudents(courseId, studentIds),
    ]);
    const students = (profiles ?? [])
      .map((p) => {
        const prog = progressById.get(p.id as string) ?? { percent: 0, completedItems: 0, totalItems: 0, completedAt: null };
        return {
          studentId: p.id,
          firstName: p.first_name ?? null,
          lastName: p.last_name ?? null,
          email: (p.email as string | null) ?? null,
          avatarUrl: p.avatar_url ?? null,
          ...prog,
        };
      })
      .sort((a, b) =>
        `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(`${b.lastName ?? ""} ${b.firstName ?? ""}`)
      );
    res.json({ courseId, students });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/progress/my", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data: enrollments, error } = await supabaseAdmin
    .from("course_enrollments")
    .select("course_id")
    .eq("student_id", req.userId ?? "")
    .eq("status", "active");
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  try {
    const out = await Promise.all(
      (enrollments ?? []).map(async (e) => {
        const state = await getStudentCourseState(e.course_id as string, req.userId ?? "");
        return { courseId: e.course_id as string, ...state.progress };
      })
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
