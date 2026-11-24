import { supabase } from "@/lib/supabase";

// Mirrors the camelCase shapes produced by api-server routes/course-modules.ts
// and lib/courseProgress.ts. Keep in sync when adding fields.

export type ModuleItemType = "lesson" | "assignment" | "quiz";
export type PrerequisiteMode = "none" | "previous" | "module";

export interface CourseProgress {
  percent: number;
  completedItems: number;
  totalItems: number;
  completedAt: string | null;
}

export interface ModuleItem {
  id: string;
  moduleId: string;
  itemType: ModuleItemType;
  targetId: string;
  lessonId: string | null;
  assignmentId: string | null;
  quizId: string | null;
  position: number;
  isSequential: boolean;
  title: string;
  isPublished: boolean;
  dueDate: string | null;
  hasVideo: boolean;
  requireVideoWatch: boolean;
  // student view only
  completed?: boolean;
  completedAt?: string | null;
  locked?: boolean;
  lockReason?: string | null;
}

export interface CourseModule {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  position: number;
  isPublished: boolean;
  prerequisiteMode: PrerequisiteMode;
  prerequisiteModuleId: string | null;
  items: ModuleItem[];
  // student view only
  completed?: boolean;
  locked?: boolean;
  lockReason?: string | null;
  completedItems?: number;
  totalItems?: number;
}

export interface ModulesResponse {
  isManager: boolean;
  modules: CourseModule[];
  progress: CourseProgress | null;
}

export interface LessonAttachment {
  name: string;
  url: string;
  size: number | null;
  contentType: string | null;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleId: string;
  itemId: string | null;
  isSequential: boolean;
  title: string;
  body: string;
  videoUrl: string | null;
  requireVideoWatch: boolean;
  attachments: LessonAttachment[];
  isPublished: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  completed: boolean;
  completedAt: string | null;
  locked: boolean;
  lockReason: string | null;
}

export interface StudentProgressRow extends CourseProgress {
  studentId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function modulesApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, (json as { error?: string }).error ?? `Request failed (${res.status})`, json as Record<string, unknown>);
  }
  return json as T;
}

export const modulesKey = (courseId: string) => ["course-modules", courseId] as const;
export const progressKey = (courseId: string) => ["course-progress", courseId] as const;
export const lessonKey = (lessonId: string) => ["course-lesson", lessonId] as const;
