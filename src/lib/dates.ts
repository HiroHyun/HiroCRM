// The one calendar & formatting module, shared by server and client so
// picker presets and KPI queries agree exactly.
// Wall-clock Date mutation (setDate/setHours) is allowed here and only
// here — day/week boundaries are wall-clock concepts. Everything else in
// src/lib does duration math on epoch milliseconds.
// Functions never mutate their Date arguments.

export interface WeekRange {
  start: Date;
  /** Exclusive: an instant exactly at `end` belongs to the next week. */
  end: Date;
}

/** Half-open [start, end) window; mirrors WeekRange's convention for non-week ranges. */
export interface DateRange {
  start: Date;
  /** exclusive */
  end: Date;
}

/** Monday 00:00 local time of the week containing `d`. Weeks start Monday. */
export function startOfWeek(d: Date): Date {
  const result = new Date(d.getTime());
  const sinceMonday = (result.getDay() + 6) % 7; // Mon 0 … Sun 6
  result.setDate(result.getDate() - sinceMonday);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Half-open week window [Mon 00:00, next Mon 00:00). The end is derived
 * wall-clock (setDate +7), never start + 7·24h epoch — DST-transition weeks
 * really are 167h or 169h long.
 */
export function weekRange(d: Date): WeekRange {
  const start = startOfWeek(d);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/** This week's Mon–Sun window. `now` is required — caller picks one instant. */
export function thisWeekRange(now: Date): WeekRange {
  return weekRange(now);
}

/** Last week's Mon–Sun window; its end equals this week's start. */
export function lastWeekRange(now: Date): WeekRange {
  const probe = startOfWeek(now);
  probe.setDate(probe.getDate() - 7);
  return weekRange(probe);
}

/** Local midnight (00:00:00.000) of the day containing `d`. */
export function startOfDay(d: Date): Date {
  const result = new Date(d.getTime());
  result.setHours(0, 0, 0, 0);
  return result;
}

/** Local midnight of the day after `d` — turns an inclusive "to" day into a half-open bound. */
export function startOfNextDay(d: Date): Date {
  const result = startOfDay(d);
  result.setDate(result.getDate() + 1);
  return result;
}

/**
 * Half-open [start, end) window covering the last `n` calendar days
 * including today: start is `n - 1` days before today's local midnight, end
 * is tomorrow's local midnight. Calendar-day arithmetic (setDate), DST-safe
 * like weekRange.
 */
export function lastNDaysRange(now: Date, n: number): DateRange {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (n - 1));
  const end = startOfNextDay(now);
  return { start, end };
}

/** This calendar month's [1st 00:00, next month's 1st 00:00) window. */
export function thisMonthRange(now: Date): DateRange {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end };
}

/**
 * The equal-length window immediately before `range`, shifted by calendar
 * days (setDate) — never epoch subtraction, which would drift across a DST
 * transition.
 */
export function previousRange(range: DateRange): DateRange {
  const days = Math.round(
    (range.end.getTime() - range.start.getTime()) / 86_400_000,
  );
  const prevEnd = new Date(range.start.getTime());
  const prevStart = new Date(range.start.getTime());
  prevStart.setDate(prevStart.getDate() - days);
  return { start: prevStart, end: prevEnd };
}

// Pinned to en-US so server and client can never disagree by locale.
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const DATE_FORMAT_SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

const DATETIME_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Some ICU builds emit NBSP/NNBSP separators; normalize to plain spaces. */
function toAsciiSpaces(s: string): string {
  return s.replace(/[  ]/g, " ");
}

/** `Jan 5, 2026` */
export function formatDate(d: Date): string {
  return toAsciiSpaces(DATE_FORMAT.format(d));
}

/** `Jun 11` — no year. */
export function formatDateShort(d: Date): string {
  return toAsciiSpaces(DATE_FORMAT_SHORT.format(d));
}

/** `Jan 5, 2026, 14:30` */
export function formatDateTime(d: Date): string {
  return toAsciiSpaces(DATETIME_FORMAT.format(d));
}

const MINUTE_MS = 60_000;

/**
 * SLA duration copy (approved export shapes): `40m` under an hour,
 * `9h 20m` under a day, `2d 16h` beyond. Floors throughout; negative input
 * clamps to `0m` (callers pass already-signed msRemaining/msOverdue).
 */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / MINUTE_MS));
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours === 0) return `${totalMinutes}m`;
  if (totalHours < 24) return `${totalHours}h ${totalMinutes % 60}m`;
  return `${Math.floor(totalHours / 24)}d ${totalHours % 24}h`;
}
