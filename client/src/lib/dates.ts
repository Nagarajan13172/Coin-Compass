import {
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addWeeks,
  addMonths,
  addYears,
  endOfWeek,
  endOfMonth,
  endOfYear,
} from "date-fns";
import type { PeriodKey } from "@/lib/types";

export function fmtDate(iso: string, pattern = "dd MMM yyyy") {
  return format(parseISO(iso), pattern);
}

/** Human label for a transaction date header (Today / Yesterday / date). */
export function dateGroupLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, dd MMM yyyy");
}

export function dayKey(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

/**
 * Same as formatDateRange but `end` is EXCLUSIVE (as returned by resolvePeriod /
 * periodRange, e.g. a July range ends at 1 Aug). Shows the inclusive last day so
 * a month reads "1–31 Jul 2026" rather than "1 Jul – 1 Aug 2026".
 */
export function formatPeriodRange(startIso: string, endExclusiveIso: string) {
  const inclusiveEnd = new Date(new Date(endExclusiveIso).getTime() - 1).toISOString();
  return formatDateRange(startIso, inclusiveEnd);
}

/** Compact, explicit label for a date range, e.g. "1–31 Jul 2026" or "28 Dec – 3 Jan 2027". */
export function formatDateRange(startIso: string, endIso: string) {
  const s = parseISO(startIso);
  const e = parseISO(endIso);
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) return `${format(s, "d")}–${format(e, "d MMM yyyy")}`;
  if (sameYear) return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`;
  return `${format(s, "d MMM yyyy")} – ${format(e, "d MMM yyyy")}`;
}

/** Resolve a period key + reference date into a concrete range. */
export function periodRange(period: PeriodKey, ref: Date) {
  switch (period) {
    case "week":
      return { start: startOfWeek(ref, { weekStartsOn: 1 }), end: endOfWeek(ref, { weekStartsOn: 1 }) };
    case "year":
      return { start: startOfYear(ref), end: endOfYear(ref) };
    case "month":
    default:
      return { start: startOfMonth(ref), end: endOfMonth(ref) };
  }
}

export function shiftPeriod(period: PeriodKey, ref: Date, dir: number): Date {
  switch (period) {
    case "week":
      return addWeeks(ref, dir);
    case "year":
      return addYears(ref, dir);
    case "month":
    default:
      return addMonths(ref, dir);
  }
}

export function periodLabel(period: PeriodKey, ref: Date) {
  switch (period) {
    case "week": {
      const { start, end } = periodRange("week", ref);
      return `${format(start, "dd MMM")} – ${format(end, "dd MMM")}`;
    }
    case "year":
      return format(ref, "yyyy");
    case "month":
    default:
      return format(ref, "MMMM yyyy");
  }
}
