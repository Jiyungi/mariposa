/**
 * UTC-safe date helpers for the Shared Calendar (Req 10).
 *
 * Trying-window and event dates are plain ISO calendar dates (YYYY-MM-DD) with
 * no time zone. All formatting and arithmetic here is pinned to UTC so a date
 * never shifts a day across the local time zone — the day the engine computes
 * is the day the calendar shows (Req 10.3, Property 25).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` string into a UTC epoch-ms value. */
function toUtcMs(iso: string): number {
  return Date.parse(`${iso}T00:00:00.000Z`);
}

/** Format `2026-06-27` as `Jun 27, 2026`. */
export function formatLong(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(toUtcMs(iso));
}

/** Format `2026-06-27` as `Sat, Jun 27`. */
export function formatWeekday(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(toUtcMs(iso));
}

/** The 3-letter uppercase month for a compact date badge, e.g. `JUL`. */
export function monthBadge(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
    .format(toUtcMs(iso))
    .toUpperCase();
}

/** The day-of-month for a compact date badge, e.g. `2`. */
export function dayBadge(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", timeZone: "UTC" }).format(
    toUtcMs(iso),
  );
}

/** Whole-day count from `a` to `b` (b − a). Negative when b precedes a. */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcMs(b) - toUtcMs(a)) / MS_PER_DAY);
}

/** Add `n` whole days to an ISO date, returning a new ISO date. */
export function addDays(iso: string, n: number): string {
  return new Date(toUtcMs(iso) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Chronological comparator for ISO date strings (nulls sort last). */
export function compareIso(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/** `YYYY-MM` key for grouping days into a calendar month. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

/** Parse `YYYY-MM` into numeric year and month (1–12). */
export function parseMonthKey(key: string): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year, month };
}

/** First ISO date of a calendar month. */
export function startOfMonth(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/** Shift a month key by `delta` months (negative = earlier). */
export function shiftMonthKey(key: string, delta: number): string {
  const { year, month } = parseMonthKey(key);
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a month grid header, e.g. `June 2026`. */
export function formatMonthTitle(key: string): string {
  const { year, month } = parseMonthKey(key);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(Date.UTC(year, month - 1, 1));
}

/** Weekday index for an ISO date: 0 = Sunday … 6 = Saturday (UTC). */
export function weekdayIndex(iso: string): number {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

/** Number of days in the month identified by `YYYY-MM`. */
export function daysInMonth(key: string): number {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Build a Sunday-start month grid: leading/trailing `null` cells plus ISO dates.
 */
export function buildMonthGrid(key: string): Array<string | null> {
  const first = startOfMonth(key);
  const leading = weekdayIndex(first);
  const total = daysInMonth(key);
  const cells: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= total; day += 1) {
    cells.push(`${key}-${String(day).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** True when `iso` falls on or between `start` and `end` (inclusive). */
export function isBetweenInclusive(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}
