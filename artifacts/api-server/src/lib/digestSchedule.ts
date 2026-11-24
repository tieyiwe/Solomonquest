/**
 * Next-run calculation for the parent progress digest.
 *
 * Schedules are wall-clock times in the school's timezone ("Fridays at
 * 16:00 Africa/Lagos"), so every candidate is built from local calendar
 * fields and converted to UTC with that zone's offset on that date. That
 * keeps the local time stable across DST changes. Pure: no I/O, so it is
 * unit-tested directly.
 */

export type DigestFrequency = "manual" | "weekly" | "biweekly" | "monthly";

export interface DigestSchedule {
  frequency: DigestFrequency;
  /** 0 = Sunday … 6 = Saturday (weekly / biweekly). */
  weekday: number;
  /** 1–31 (monthly). Months without that day use their last day. */
  dayOfMonth: number;
  /** "HH:MM", 24-hour, local to `timezone`. */
  sendTime: string;
  /** IANA zone, e.g. "Europe/London". */
  timezone: string;
}

const DAY_MS = 86_400_000;

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidSendTime(t: unknown): t is string {
  return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

/** Local calendar fields of an instant in `tz`. */
export function localParts(date: Date, tz: string): LocalParts {
  const parts: Record<string, number> = {};
  for (const p of formatter(tz).formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute };
}

/** Offset of `tz` from UTC at `date`, in ms (local = utc + offset). */
function offsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return asUtc - truncated;
}

/**
 * The UTC instant for a local wall-clock time in `tz`. A time skipped by a
 * spring-forward change (e.g. 02:30) resolves to the same distance past the
 * gap (03:30); a repeated fall-back time resolves to its first occurrence.
 */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, tz: string): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const matches = (t: number) => {
    const p = localParts(new Date(t), tz);
    return p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute;
  };
  const o1 = offsetMs(new Date(wall), tz);
  let t = wall - o1;
  if (!matches(t)) {
    const o2 = offsetMs(new Date(t), tz);
    const t2 = wall - o2;
    // Near a transition the second offset is the right one; if neither
    // round-trips the time falls in a spring-forward gap: apply the offset
    // from before the change, which lands the same distance past the gap.
    t = matches(t2) ? t2 : wall - Math.min(o1, o2);
  }
  // Ambiguous (fall-back) times: prefer the earlier instant if it is also valid.
  const earlier = t - 3_600_000;
  const pe = localParts(new Date(earlier), tz);
  if (pe.year === year && pe.month === month && pe.day === day && pe.hour === hour && pe.minute === minute) t = earlier;
  return new Date(t);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function parseTime(t: string): [number, number] {
  const [h, m] = t.split(":").map(Number);
  return [h, m];
}

/** First weekly occurrence strictly after `after`. */
function nextWeekly(s: DigestSchedule, after: Date): Date {
  const [hh, mm] = parseTime(s.sendTime);
  const start = localParts(after, s.timezone);
  for (let i = 0; i <= 8; i++) {
    const d = new Date(Date.UTC(start.year, start.month - 1, start.day + i));
    if (d.getUTCDay() !== s.weekday) continue;
    const t = zonedTimeToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hh, mm, s.timezone);
    if (t.getTime() > after.getTime()) return t;
  }
  // Unreachable for a valid weekday; fall back a week out.
  return new Date(after.getTime() + 7 * DAY_MS);
}

/** First monthly occurrence strictly after `after` (day clamped to month length). */
function nextMonthly(s: DigestSchedule, after: Date): Date {
  const [hh, mm] = parseTime(s.sendTime);
  const start = localParts(after, s.timezone);
  for (let i = 0; i <= 2; i++) {
    const y = start.year + Math.floor((start.month - 1 + i) / 12);
    const m = ((start.month - 1 + i) % 12) + 1;
    const day = Math.min(s.dayOfMonth, daysInMonth(y, m));
    const t = zonedTimeToUtc(y, m, day, hh, mm, s.timezone);
    if (t.getTime() > after.getTime()) return t;
  }
  return new Date(after.getTime() + 31 * DAY_MS);
}

/**
 * When the digest should next go out, strictly after `now`.
 *
 * `previous` is the slot that just ran (the claimed next_run_at). Biweekly
 * schedules need it to stay on alternate weeks: the next slot is the first
 * matching weekday more than 8 days after it (so +14 days of wall-clock
 * time, DST-safe), moved forward in two-week steps if the server was down.
 * Returns null for manual-only schedules.
 */
export function computeNextRun(s: DigestSchedule, now: Date, previous?: Date | null): Date | null {
  if (s.frequency === "manual") return null;
  if (s.frequency === "weekly") return nextWeekly(s, now);
  if (s.frequency === "monthly") return nextMonthly(s, now);
  // biweekly
  if (!previous) return nextWeekly(s, now);
  let t = nextWeekly(s, new Date(previous.getTime() + 8 * DAY_MS));
  for (let guard = 0; t.getTime() <= now.getTime() && guard < 1000; guard++) {
    t = nextWeekly(s, new Date(t.getTime() + 8 * DAY_MS));
  }
  return t;
}

/** "this week", "these past two weeks", "this month" — used in digest copy. */
export function periodLabel(f: DigestFrequency): string {
  if (f === "biweekly") return "these past two weeks";
  if (f === "monthly") return "this month";
  return "this week";
}

/** How far back "recent" reaches for announcements, by frequency. */
export function periodDays(f: DigestFrequency): number {
  if (f === "biweekly") return 14;
  if (f === "monthly") return 31;
  return 7;
}
