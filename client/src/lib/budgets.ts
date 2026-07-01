import { formatMoney } from "@/lib/format";
import type { Budget, BudgetPeriod } from "@/lib/types";

/** At/above this % of the limit a budget is flagged "Near limit" (drives both bar + badge). */
export const NEAR_LIMIT_PCT = 80;

export const BUDGET_PERIOD_LABEL: Record<BudgetPeriod, string> = {
  weekly: "This week",
  monthly: "This month",
  yearly: "This year",
};

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

/** Map a budget period to the Transactions page period key (weekly has no direct match). */
export function budgetPeriodToTxnPeriod(period: BudgetPeriod): "month" | "year" | null {
  if (period === "monthly") return "month";
  if (period === "yearly") return "year";
  return null;
}
