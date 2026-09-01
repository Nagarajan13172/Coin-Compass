/**
 * What a goal is actually being fed each month, taken from the recurring rules
 * that pay into it — rather than the planned figure a user typed once and never
 * revisited. That's what makes "ready by February" trustworthy. Pure and DB-free.
 */

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

const PER_MONTH: Record<Frequency, number> = {
  // 365/12 days and 52/12 weeks in an average month; monthly is exact, and a
  // yearly rule contributes a twelfth of its amount each month.
  daily: 365 / 12,
  weekly: 52 / 12,
  monthly: 1,
  yearly: 1 / 12,
};

/** A rule's amount expressed as a monthly rate: every 2 weeks → amount × 26/12. */
export function monthlyRate(amount: number, frequency: Frequency, interval = 1): number {
  const every = Math.max(1, interval);
  return (amount * PER_MONTH[frequency]) / every;
}

export interface FundingRule {
  amount: number;
  frequency: Frequency;
  interval?: number | null;
}

/** Combined monthly funding from a set of rules, rounded to paise. */
export function monthlyFunding(rules: FundingRule[]): number {
  const total = rules.reduce((sum, r) => sum + monthlyRate(r.amount, r.frequency, r.interval ?? 1), 0);
  return Math.round(total * 100) / 100;
}

/**
 * When the goal is reached at `perMonth`, or null when nothing is funding it (or
 * it's already there). Months are rounded up: a part-month still needs the whole
 * contribution to land.
 */
export function projectedCompletion(remaining: number, perMonth: number, from: Date): Date | null {
  if (remaining <= 0 || perMonth <= 0) return null;
  const months = Math.ceil(remaining / perMonth);
  const date = new Date(from);
  date.setMonth(date.getMonth() + months);
  return date;
}

/**
 * Whether the projection lands before the goal's target date. Undated goals have
 * nothing to be late for, so they're never "behind".
 */
export function scheduleVerdict(
  projected: Date | null,
  targetDate: Date | null
): "on_track" | "behind" | "unknown" {
  if (!targetDate || !projected) return "unknown";
  return projected.getTime() <= targetDate.getTime() ? "on_track" : "behind";
}
