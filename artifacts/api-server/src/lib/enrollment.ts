import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";

/**
 * Enrolls a student in a course and, if that course belongs to a program,
 * cascades the enrollment to every other course in the same program and
 * ensures the student is a member of that program's shared chat channel.
 * Safe to call for a course that isn't in a program (cascade is a no-op).
 */
export async function enrollStudentInCourse(courseId: string, studentId: string): Promise<void> {
  await supabaseAdmin
    .from("course_enrollments")
    .upsert(
      { course_id: courseId, student_id: studentId, status: "active" },
      { onConflict: "course_id,student_id", ignoreDuplicates: true }
    );

  const { data: course } = await supabaseAdmin
    .from("courses")
    .select("program_id, school_id")
    .eq("id", courseId)
    .single();

  const programId = course?.program_id as string | null | undefined;
  if (!programId) return;

  const { data: siblingCourses, error: siblingsError } = await supabaseAdmin
    .from("courses")
    .select("id")
    .eq("program_id", programId);

  if (siblingsError) {
    logger.error({ err: siblingsError }, "Failed to look up sibling courses for program cascade enrollment");
  } else {
    const siblingIds = (siblingCourses ?? []).map((c) => c.id as string).filter((id) => id !== courseId);
    if (siblingIds.length > 0) {
      const rows = siblingIds.map((id) => ({ course_id: id, student_id: studentId, status: "active" }));
      const { error } = await supabaseAdmin
        .from("course_enrollments")
        .upsert(rows, { onConflict: "course_id,student_id", ignoreDuplicates: true });
      if (error) {
        logger.error({ err: error }, "Failed to cascade-enroll student into sibling program courses");
      }
    }
  }

  const channelId = await ensureProgramChannel(programId, course?.school_id as string | null);
  if (channelId) {
    const { error: memberError } = await supabaseAdmin
      .from("chat_channel_members")
      .upsert(
        { channel_id: channelId, user_id: studentId },
        { onConflict: "channel_id,user_id", ignoreDuplicates: true }
      );
    if (memberError) {
      logger.error({ err: memberError }, "Failed to add student to program chat channel");
    }
  }
}

/** Finds or creates the single shared chat channel for a program. */
export async function ensureProgramChannel(programId: string, schoolId?: string | null): Promise<string | null> {
  const { data: existing } = await supabaseAdmin
    .from("chat_channels")
    .select("id")
    .eq("program_id", programId)
    .eq("type", "program")
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: program } = await supabaseAdmin
    .from("programs")
    .select("name, school_id")
    .eq("id", programId)
    .single();

  const { data: created, error } = await supabaseAdmin
    .from("chat_channels")
    .insert({
      name: program?.name ? `${program.name}` : "Program Chat",
      type: "program",
      program_id: programId,
      school_id: schoolId ?? program?.school_id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // Another concurrent enrollment may have just created it — re-fetch instead of failing.
    const { data: raceWinner } = await supabaseAdmin
      .from("chat_channels")
      .select("id")
      .eq("program_id", programId)
      .eq("type", "program")
      .maybeSingle();
    if (raceWinner?.id) return raceWinner.id as string;
    logger.error({ err: error }, "Failed to create program chat channel");
    return null;
  }

  return created.id as string;
}
