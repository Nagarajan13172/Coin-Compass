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
