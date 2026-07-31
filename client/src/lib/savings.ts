import type { Summary } from "@/lib/types";

/**
 * Share of income you kept, as a whole-number percentage.
 *
 * Measured against `consumption` (expense minus savings deposits and debt
 * principal), NOT the raw expense total. Money moved into a deposit is still
 * yours, and repaying principal converts debt into equity — neither makes you
 * poorer, so neither belongs in a "how much did I keep" figure. Counting them
 * reported ~13% for a month that was really nearer 30%.
 *
 * Returns null when there's no income to divide by, so callers can render "—"
 * rather than a meaningless 0%.
 */
export function savingsRate(summary: Pick<Summary, "income" | "consumption"> | undefined): number | null {
  if (!summary || summary.income <= 0) return null;
  return Math.round(((summary.income - summary.consumption) / summary.income) * 100);
}
