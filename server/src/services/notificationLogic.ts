/**
 * Pure helpers for notification generation — no database access, so they can be
 * unit-tested in isolation (the DB orchestration lives in notificationService).
 */

/** How far ahead (days) an active recurring rule counts as "due soon". */
export const DUE_SOON_DAYS = 3;

/** A short human title for a recurring rule, from its own fields (server has no
 *  category populate here). Mirrors the client's `ruleTitle` fallback order. */
export function ruleTitle(rule: { payee?: string | null; note?: string | null }): string {
  return (rule.payee || "").trim() || (rule.note || "").trim() || "Recurring";
}

/** Classify an upcoming/late occurrence relative to now. */
export function classifyDue(nextRun: Date, now: Date): "overdue" | "due_soon" {
  return nextRun < now ? "overdue" : "due_soon";
}

/** Spend has passed the budget's limit. */
export function isBudgetOver(spent: number, amount: number): boolean {
  return spent > amount;
}

/** `YYYY-MM` bucket used to rate-limit the low-balance alert to once per month. */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---- Dedupe keys: stable strings that make each notification idempotent so a
// repeated sweep (or a boot+hourly double cron run) never duplicates a row. ----

export function postedDedupeKey(ruleId: string, lastRun: Date): string {
  return `recurring.posted:${ruleId}:${lastRun.toISOString()}`;
}

export function endedDedupeKey(ruleId: string): string {
  return `recurring.ended:${ruleId}`;
}

export function dueDedupeKey(kind: "due_soon" | "overdue", ruleId: string, nextRun: Date): string {
  return `recurring.${kind}:${ruleId}:${nextRun.toISOString()}`;
}

export function budgetDedupeKey(budgetId: string, periodStart: Date): string {
  return `budget.exceeded:${budgetId}:${periodStart.toISOString()}`;
}

export function balanceDedupeKey(accountId: string, ref: Date): string {
  return `balance.low:${accountId}:${monthKey(ref)}`;
}
