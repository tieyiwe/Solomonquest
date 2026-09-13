import { Router, type IRouter } from "express";
import { supabaseAdmin } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const USER_LIMIT = 8;
const COURSE_LIMIT = 8;
const SUBMISSION_LIMIT = 8;

// Candidate pool size fetched before in-memory filtering for submissions
// (see note below on why that search can't be done as a single PostgREST
// .or() filter across a joined table).
const SUBMISSION_CANDIDATE_LIMIT = 200;

// PostgREST's .or() filter string treats ',', '(', ')', and '.' as syntax
// (condition separators / grouping / operator delimiters) — stripping only
// quotes would leave those free for a search value to inject extra OR
// conditions or alter filter grouping. Strip anything that isn't a normal
// search character. Mirrors users.ts's GET /users/search sanitization —
// keep both in sync if this rule ever changes.
function sanitizeForOrFilter(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}\s@._-]/gu, "").slice(0, 100);
}

interface UserResult {
  type: "user";
  id: string;
  title: string;
  subtitle: string;
  role: string;
}

interface CourseResult {
  type: "course";
  id: string;
  title: string;
  subtitle: string;
}

interface SubmissionResult {
  type: "submission";
  id: string;
  title: string;
  subtitle: string;
  assignmentId: string;
  courseId: string | null;
}

async function searchUsers(req: AuthenticatedRequest, q: string): Promise<UserResult[]> {
  // Mirrors GET /users's own role gate (admin/super_admin/teacher) — a
  // plain student or staff caller gets no user results from global search,
  // rather than granting them directory access they don't have anywhere
  // else in the app.
  if (req.userRole !== "admin" && req.userRole !== "super_admin" && req.userRole !== "teacher") {
    return [];
  }

  let query = supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name, role, internal_email, unique_student_id");

  if (req.userRole === "super_admin") {
    // super_admin is platform-wide, same as users.ts's /users/search route.
  } else {
    if (!req.schoolId) return [];
    query = query.eq("school_id", req.schoolId);
  }

  if (req.userId) {
    query = query.neq("id", req.userId);
  }

  query = query.or(
    `first_name.ilike.%${q}%,last_name.ilike.%${q}%,unique_student_id.ilike.%${q}%,internal_email.ilike.%${q}%`
  );

  const { data, error } = await query.limit(USER_LIMIT);
  if (error || !data) return [];

  return data.map((p) => ({
    type: "user" as const,
    id: p.id as string,
    title: [p.first_name, p.last_name].filter(Boolean).join(" ") || (p.internal_email as string) || "Unknown user",
    subtitle: `${(p.role as string) ?? ""}${p.unique_student_id ? ` · ${p.unique_student_id}` : ""}`,
    role: p.role as string,
  }));
}

async function searchCourses(req: AuthenticatedRequest, q: string): Promise<CourseResult[]> {
  // Same school scoping as GET /courses — that route doesn't further
  // restrict by role within a school, so search doesn't either.
  const { data, error } = await supabaseAdmin
    .from("courses")
    .select("id, title, code")
    .eq("school_id", req.schoolId ?? "")
    .or(`title.ilike.%${q}%,code.ilike.%${q}%`)
    .limit(COURSE_LIMIT);

  if (error || !data) return [];

  return data.map((c) => ({
    type: "course" as const,
    id: c.id as string,
    title: c.title as string,
    subtitle: (c.code as string | null) ?? "",
  }));
}

async function searchSubmissions(req: AuthenticatedRequest, q: string): Promise<SubmissionResult[]> {
  // Submissions search can't be done as a single .or() filter string the
  // way users/courses are: the match needs to span a joined assignment
  // title or student name, and the *authorization* scope (which
  // assignment/course ids the caller may see) differs entirely by role.
  // So: first resolve the authorized assignment/student scope exactly the
  // way submissions.ts's own routes do, fetch a bounded candidate pool
  // within that scope, then filter by the search text in memory. This
  // trades a little extra row-fetching for never having to build a
  // cross-table filter string from user input.
  let assignmentIds: string[] | null = null; // null = no assignment-id restriction (student path uses student_id instead)
  let studentIdFilter: string | null = null;

  if (req.userRole === "student") {
    studentIdFilter = req.userId ?? "";
  } else if (req.userRole === "teacher") {
    const { data: courses } = await supabaseAdmin
      .from("courses")
      .select("id")
      .eq("teacher_id", req.userId ?? "");
    const courseIds = (courses ?? []).map((c) => c.id as string);
    if (courseIds.length === 0) return [];
    const { data: assignments } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .in("course_id", courseIds);
    assignmentIds = (assignments ?? []).map((a) => a.id as string);
    if (assignmentIds.length === 0) return [];
  } else if (req.userRole === "admin" || req.userRole === "super_admin") {
    let courseQuery = supabaseAdmin.from("courses").select("id");
    if (req.userRole !== "super_admin") {
      if (!req.schoolId) return [];
      courseQuery = courseQuery.eq("school_id", req.schoolId);
    }
    const { data: courses } = await courseQuery;
    const courseIds = (courses ?? []).map((c) => c.id as string);
    if (courseIds.length === 0) return [];
    const { data: assignments } = await supabaseAdmin
      .from("assignments")
      .select("id")
      .in("course_id", courseIds);
    assignmentIds = (assignments ?? []).map((a) => a.id as string);
    if (assignmentIds.length === 0) return [];
  } else {
    // staff/parent/unknown role — no submission-listing route exists for
    // them elsewhere in the app either, so no search results.
    return [];
  }

  let submissionsQuery = supabaseAdmin
    .from("submissions")
    .select("id, assignment_id, student_id, grade, status, assignments(id, title, course_id, courses(id, title))")
    .limit(SUBMISSION_CANDIDATE_LIMIT);

  if (studentIdFilter !== null) {
    submissionsQuery = submissionsQuery.eq("student_id", studentIdFilter);
  } else if (assignmentIds) {
    submissionsQuery = submissionsQuery.in("assignment_id", assignmentIds);
  }

  const { data: rows, error } = await submissionsQuery;
  if (error || !rows) return [];

  const studentIds = Array.from(new Set(rows.map((r) => r.student_id as string).filter(Boolean)));
  const { data: profiles } = studentIds.length
    ? await supabaseAdmin.from("profiles").select("id, first_name, last_name").in("id", studentIds)
    : { data: [] as { id: string; first_name: string | null; last_name: string | null }[] };
  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(" ")])
  );

  const needle = q.toLowerCase();

  const matches: SubmissionResult[] = [];
  for (const row of rows) {
    const assignment = row.assignments as unknown as { id: string; title: string; course_id: string; courses: { id: string; title: string } | { id: string; title: string }[] | null } | null;
    const assignmentTitle = assignment?.title ?? "";
    const studentName = row.student_id ? nameById.get(row.student_id as string) ?? "" : "";
    const courseRel = Array.isArray(assignment?.courses) ? assignment?.courses[0] : assignment?.courses;
    const courseTitle = courseRel?.title ?? "";

    if (
      !assignmentTitle.toLowerCase().includes(needle) &&
      !studentName.toLowerCase().includes(needle)
    ) {
      continue;
    }

    matches.push({
      type: "submission",
      id: row.id as string,
      title: assignmentTitle || "Untitled assignment",
      subtitle: [studentName, courseTitle].filter(Boolean).join(" · "),
      assignmentId: row.assignment_id as string,
      courseId: assignment?.course_id ?? courseRel?.id ?? null,
    });

    if (matches.length >= SUBMISSION_LIMIT) break;
  }

  return matches;
}

// GET /search?q=<query> — global quick-jump search across users, courses,
// and submissions. Each caller only ever sees results they'd already be
// authorized to see via the existing per-resource endpoints (see the
// per-section comments above) — supabaseAdmin bypasses RLS entirely, so
// this route self-enforces every bit of that scoping.
router.get("/search", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const raw = (req.query.q as string | undefined)?.trim() ?? "";

  if (raw.length < 2) {
    res.json({ users: [], courses: [], submissions: [] });
    return;
  }

  const q = sanitizeForOrFilter(raw);
  if (q.length < 2) {
    res.json({ users: [], courses: [], submissions: [] });
    return;
  }

  const [users, courses, submissions] = await Promise.all([
    searchUsers(req, q).catch(() => []),
    searchCourses(req, q).catch(() => []),
    searchSubmissions(req, q).catch(() => []),
  ]);

  res.json({ users, courses, submissions });
});

export default router;
