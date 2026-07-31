/**
 * Date-range helpers for reports & budgets. All ranges are [start, end).
 */

export type Period = "week" | "month" | "year" | "all" | "custom";

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function startOfWeek(d: Date, firstDayOfWeek = 1): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = (day - firstDayOfWeek + 7) % 7;
  x.setDate(x.getDate() - diff);
  return x;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

export function addYears(d: Date, n: number): Date {
  const x = new Date(d);
  x.setFullYear(x.getFullYear() + n);
  return x;
}

/** A `to` query param that names a whole calendar day rather than an instant. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Turn a `to` query param into the EXCLUSIVE end of a [start, end) range.
 *
 * Two callers send two different things, and conflating them silently widened
 * every report by a day:
 *   - a bare day ("2026-06-30") means "include all of the 30th", so the
 *     exclusive end is the start of the next day;
 *   - a full ISO instant (endOfMonth() → "2026-06-30T18:29:59.999Z") is ALREADY
 *     the end of the range and must be used as-is.
 *
 * Adding 24h unconditionally made "last month" run to 2 July, which is why the
 * period-over-period comparison reported the 1st of the current month as if it
 * belonged to the previous one.
 */
export function exclusiveEnd(to: string): Date {
  const raw = new Date(to);
  if (Number.isNaN(raw.getTime())) return new Date();
  return DATE_ONLY.test(to.trim()) ? new Date(raw.getTime() + 86_400_000) : raw;
}

/** Resolve a named period (anchored on `ref`) into a concrete [start, end) range. */
export function resolvePeriod(
  period: Period,
  ref: Date = new Date(),
  firstDayOfWeek = 1
): { start: Date; end: Date } {
  switch (period) {
    case "week": {
      const start = startOfWeek(ref, firstDayOfWeek);
      return { start, end: addDays(start, 7) };
    }
    case "month": {
      const start = startOfMonth(ref);
      return { start, end: addMonths(start, 1) };
    }
    case "year": {
      const start = startOfYear(ref);
      return { start, end: addYears(start, 1) };
    }
    case "all":
    default:
      return { start: new Date(0), end: addYears(ref, 1) };
  }
}
