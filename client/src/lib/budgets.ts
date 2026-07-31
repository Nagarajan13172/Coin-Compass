import { formatMoney } from "@/lib/format";
import type { Budget, BudgetPeriod } from "@/lib/types";

/** At/above this % of the limit a budget is flagged "Near limit" (drives both bar + badge). */
export const NEAR_LIMIT_PCT = 80;

/** Order periods weekly → monthly → yearly for stable display. */
export const BUDGET_PERIOD_ORDER: BudgetPeriod[] = ["weekly", "monthly", "yearly"];

export type BudgetStatus = {
  label: string;
  /** Badge variant name. */
  badge: "income" | "warning" | "expense";
  /** Progress-bar indicator class. */
  tone: string;
};

/** Single source of truth for a budget's health — keeps the badge and bar in sync. */
export function budgetStatus(b: Pick<Budget, "spent" | "amount" | "percent" | "over">): BudgetStatus {
  if (b.over || b.percent >= 100)
    return { label: `Over by ${formatMoney(Math.max(0, b.spent - b.amount))}`, badge: "expense", tone: "bg-expense" };
  if (b.percent >= NEAR_LIMIT_PCT) return { label: "Near limit", badge: "warning", tone: "bg-amber-500" };
  return { label: "On track", badge: "income", tone: "bg-income" };
}

export interface BudgetTotals {
  /** Total allowance across the budgets shown. */
  planned: number;
  /** Total already spent against them. */
  spent: number;
  /** planned − spent. Negative when the set as a whole is over. */
  left: number;
  /** Share of `planned` used, 0–∞, rounded to a whole percent. 0 when nothing is planned. */
  percent: number;
  /** How many of them are individually over their limit. */
  overCount: number;
  /** True when the set mixes weekly/monthly/yearly, so the total spans unlike periods. */
  mixedPeriods: boolean;
  /** The single period covered, or null when mixed/empty. */
  period: BudgetPeriod | null;
}

/**
 * Roll a set of budgets into one planned-vs-spent picture.
 *
 * An OVERALL budget (no category) already caps everything, so when one is
 * present it *is* the total — adding per-category budgets on top would count the
 * same spending twice. Otherwise the category budgets are summed.
 */
export function budgetTotals(budgets: Budget[]): BudgetTotals {
  const overall = budgets.find((b) => !b.category);
  const counted = overall ? [overall] : budgets;

  const planned = counted.reduce((s, b) => s + b.amount, 0);
  const spent = counted.reduce((s, b) => s + b.spent, 0);
  const periods = new Set(counted.map((b) => b.period));

  return {
    planned,
    spent,
    left: planned - spent,
    percent: planned > 0 ? Math.round((spent / planned) * 100) : 0,
    // Counted across ALL the budgets on screen, not just the ones summed — an
    // overall budget being on track shouldn't hide a category that has blown past.
    overCount: budgets.filter((b) => b.over || b.percent >= 100).length,
    mixedPeriods: periods.size > 1,
    period: periods.size === 1 ? [...periods][0] : null,
  };
}

/** Map a budget period to the Transactions page period key (weekly has no direct match). */
export function budgetPeriodToTxnPeriod(period: BudgetPeriod): "month" | "year" | null {
  if (period === "monthly") return "month";
  if (period === "yearly") return "year";
  return null;
}
