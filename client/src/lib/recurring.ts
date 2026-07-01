import { addDays, addMonths, addYears } from "date-fns";
import type { Recurring } from "@/lib/types";

/** Human label for a rule — its category, or the note/transfer fallback. */
export function ruleTitle(r: Recurring): string {
  if (r.type === "transfer") return "Transfer";
  return r.category?.name ?? (r.note || "Recurring");
}

/** Advance a date by one interval — mirror of the server's recurring schedule. */
export function advanceDate(d: Date, frequency: string, interval: number): Date {
  const n = Math.max(1, interval);
  if (frequency === "daily") return addDays(d, n);
  if (frequency === "weekly") return addDays(d, 7 * n);
  if (frequency === "monthly") return addMonths(d, n);
  if (frequency === "yearly") return addYears(d, n);
  return addMonths(d, n);
}

/**
 * The occurrences a rule would post if run right now: every scheduled date from
 * `nextRun` up to and including `now`, respecting `endDate`. Mirrors the server's
 * catch-up logic so the "Run due" preview matches what actually gets posted.
 */
export function dueDates(r: Recurring, now: Date = new Date()): Date[] {
  if (!r.active) return [];
  const out: Date[] = [];
  const end = r.endDate ? new Date(r.endDate) : null;
  let d = new Date(r.nextRun);
  let guard = 0;
  while (d <= now && guard < 500) {
    if (end && d > end) break;
    out.push(new Date(d));
    d = advanceDate(d, r.frequency, r.interval);
    guard += 1;
  }
  return out;
}

/** Whether a rule has at least one occurrence due to post now. */
export function isDue(r: Recurring, now: Date = new Date()): boolean {
  return r.active && new Date(r.nextRun) <= now;
}

/** A rule is finished when it's inactive and its end date is in the past. */
export function isEnded(r: Recurring, now: Date = new Date()): boolean {
  return !r.active && Boolean(r.endDate) && new Date(r.endDate as string) < now;
}

/** Approximate occurrences per month for a frequency + interval. */
export function perMonthFactor(frequency: string, interval: number): number {
  const n = Math.max(1, interval);
  if (frequency === "daily") return 30 / n;
  if (frequency === "weekly") return 52 / 12 / n;
  if (frequency === "monthly") return 1 / n;
  if (frequency === "yearly") return 1 / (12 * n);
  return 1 / n;
}

/** A rule's amount normalized to a per-month figure (for cash-flow summaries). */
export function monthlyAmount(r: Recurring): number {
  return r.amount * perMonthFactor(r.frequency, r.interval);
}
