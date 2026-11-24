import { supabaseAdmin } from "./supabase";
import { logger } from "./logger";
import { executeRun, mapSettingsRow, scheduleFor } from "./parentDigest";

/**
 * Sends scheduled parent digests. Runs every minute next to the reminder
 * dispatcher. For each enabled school whose next_run_at is due it:
 *
 *   1. computes the following slot from the schedule (timezone/DST aware);
 *   2. claims the due slot atomically —
 *        update school_digest_settings set next_run_at = <next>
 *        where school_id = $1 and next_run_at = <the value it read>
 *      — so when two server instances see the same due row, only one update
 *      matches and only that instance sends;
 *   3. records a digest_runs row (unique per school + scheduled slot, a
 *      second guard) and delivers it.
 *
 * Disabled schools, manual-only schedules and suspended schools are skipped.
 */
const BATCH = 20;

export async function dispatchDueDigests(now = new Date()): Promise<number> {
  const { data: due, error } = await supabaseAdmin
    .from("school_digest_settings")
    .select("*")
    .eq("enabled", true)
    .neq("frequency", "manual")
    .not("next_run_at", "is", null)
    .lte("next_run_at", now.toISOString())
    .order("next_run_at", { ascending: true })
    .limit(BATCH);
  if (error) {
    // parent-digest.sql not applied yet: nothing to send.
    if (!/school_digest_settings/.test(error.message ?? "")) logger.error({ err: error }, "[digest] failed to load due digests");
    return 0;
  }

  let started = 0;
  for (const row of due ?? []) {
    const settings = mapSettingsRow(row);
    const slot = row.next_run_at as string;
    const next = scheduleFor(settings, now, new Date(slot));

    const { data: claimed } = await supabaseAdmin
      .from("school_digest_settings")
      .update({ next_run_at: next, last_run_at: now.toISOString() })
      .eq("school_id", settings.schoolId)
      .eq("next_run_at", slot)
      .select("school_id")
      .maybeSingle();
    if (!claimed) continue; // another instance took it (or settings changed)

    const { data: school } = await supabaseAdmin.from("schools").select("is_active").eq("id", settings.schoolId).maybeSingle();
    if (school && school.is_active === false) continue;

    const { data: run, error: runError } = await supabaseAdmin
      .from("digest_runs")
      .insert({ school_id: settings.schoolId, trigger: "scheduled", scheduled_for: slot, status: "running" })
      .select("id")
      .single();
    if (runError || !run) {
      logger.warn({ err: runError, schoolId: settings.schoolId }, "[digest] could not record scheduled run (already sent?)");
      continue;
    }
    started++;
    // Await so one instance works through due schools one at a time.
    await executeRun(run.id as string, settings.schoolId, settings);
  }
  return started;
}

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

export function startDigestDispatcher(intervalMs = 60_000): void {
  if (timer) return;
  const tick = () => {
    // A long run (big school, slow SMTP) must not overlap the next tick.
    if (running) return;
    running = true;
    dispatchDueDigests()
      .catch((err) => logger.error({ err }, "[digest] dispatch tick failed"))
      .finally(() => {
        running = false;
      });
  };
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  tick();
}
