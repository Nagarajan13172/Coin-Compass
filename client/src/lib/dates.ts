import {
  format,
  isToday,
  isYesterday,
  parseISO,
  startOfWeek,
  startOfMonth,
  startOfYear,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  endOfWeek,
  endOfMonth,
  endOfYear,
  type Locale,
} from "date-fns";
import { ta as taLocale } from "date-fns/locale";
import i18n from "@/i18n";
import type { PeriodKey } from "@/lib/types";

/**
 * The date-fns locale for the active UI language, so month/weekday names render
 * translated. English uses date-fns' built-in default (undefined), so nothing
 * changes for English users. Read at call time so a language switch takes effect
 * on the next render.
 */
export function dateFnsLocale(): Locale | undefined {
  return i18n.language?.startsWith("ta") ? taLocale : undefined;
}

export function fmtDate(iso: string, pattern = "dd MMM yyyy") {
  return format(parseISO(iso), pattern, { locale: dateFnsLocale() });
}

/** Human label for a transaction date header (Today / Yesterday / date). */
export function dateGroupLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return i18n.t("date.today", { ns: "common" });
  if (isYesterday(d)) return i18n.t("date.yesterday", { ns: "common" });
  return format(d, "EEEE, dd MMM yyyy", { locale: dateFnsLocale() });
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
  const locale = dateFnsLocale();
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) return `${format(s, "d", { locale })}–${format(e, "d MMM yyyy", { locale })}`;
  if (sameYear) return `${format(s, "d MMM", { locale })} – ${format(e, "d MMM yyyy", { locale })}`;
  return `${format(s, "d MMM yyyy", { locale })} – ${format(e, "d MMM yyyy", { locale })}`;
}

/**
 * Convert a trend chart bucket into an inclusive-from / exclusive-to range for a
 * Transactions deep link. Buckets are "YYYY-MM-DD" (day) or "YYYY-MM" (month).
 * Uses the same local-midnight → ISO convention as periodRange, so the range
 * matches how the rest of the app filters transactions.
 */
export function bucketRange(bucket: string): { from: string; to: string } | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) {
    const start = parseISO(bucket);
    return { from: start.toISOString(), to: addDays(start, 1).toISOString() };
  }
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    const start = parseISO(`${bucket}-01`);
    return { from: start.toISOString(), to: addMonths(start, 1).toISOString() };
  }
  return null;
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
  const locale = dateFnsLocale();
  switch (period) {
    case "week": {
      const { start, end } = periodRange("week", ref);
      return `${format(start, "dd MMM", { locale })} – ${format(end, "dd MMM", { locale })}`;
    }
    case "year":
      return format(ref, "yyyy", { locale });
    case "month":
    default:
      return format(ref, "MMMM yyyy", { locale });
  }
}
