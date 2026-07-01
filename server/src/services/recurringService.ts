import { RecurringTransaction, type RecurringDoc } from "../models/RecurringTransaction";
import { Transaction } from "../models/Transaction";
import { addDays, addMonths, addYears } from "../utils/dateRange";

type RuleDoc = RecurringDoc & { _id: unknown; save: () => Promise<unknown> };

export function advance(date: Date, frequency: string, interval: number): Date {
  switch (frequency) {
    case "daily":
      return addDays(date, interval);
    case "weekly":
      return addDays(date, 7 * interval);
    case "monthly":
      return addMonths(date, interval);
    case "yearly":
      return addYears(date, interval);
    default:
      return addMonths(date, interval);
  }
}

const GUARD_MAX = 2000; // safety against runaway loops

/**
 * Roll a schedule forward from `startDate` to the first occurrence that is >= `now`,
 * without emitting anything. Used to re-anchor a rule after its start date changes so
 * an edit can never back-post a burst of catch-up transactions.
 */
export function nextRunFrom(
  startDate: Date,
  frequency: string,
  interval: number,
  now: Date = new Date()
): Date {
  let next = new Date(startDate);
  let iterations = 0;
  while (next < now && iterations < GUARD_MAX) {
    next = advance(next, frequency, interval);
    iterations += 1;
  }
  return next;
}

/**
 * Compute the next `count` scheduled run dates for a rule from its current nextRun,
 * respecting endDate. Pure — does not touch the database.
 */
export function previewOccurrences(
  rule: { frequency: string; interval: number; nextRun: Date; endDate?: Date | null },
  count = 5
): Date[] {
  const out: Date[] = [];
  let next = new Date(rule.nextRun);
  let iterations = 0;
  while (out.length < count && iterations < GUARD_MAX) {
    if (rule.endDate && next > rule.endDate) break;
    out.push(new Date(next));
    next = advance(next, rule.frequency, rule.interval);
    iterations += 1;
  }
  return out;
}

/**
 * Post every occurrence of a single rule that is due (<= now), mutating the rule's
 * nextRun/lastRun/active in place. Caller is responsible for saving the rule.
 * Returns the number of transactions created.
 */
async function postDueForRule(rule: RuleDoc, now: Date): Promise<number> {
  let next = new Date(rule.nextRun);
  let created = 0;
  let iterations = 0;

  while (next <= now && iterations < GUARD_MAX) {
    if (rule.endDate && next > rule.endDate) break;

    await Transaction.create({
      type: rule.type,
      amount: rule.amount,
      account: rule.account,
      toAccount: rule.toAccount,
      category: rule.category,
      date: new Date(next),
      note: rule.note,
      payee: rule.payee,
      tags: rule.tags,
      currency: rule.currency,
      recurring: rule._id,
    });
    created += 1;
    rule.lastRun = new Date(next);
    next = advance(next, rule.frequency, rule.interval);
    iterations += 1;
  }

  rule.nextRun = next;
  if (rule.endDate && next > rule.endDate) rule.active = false;
  return created;
}

/**
 * Materialize every recurring rule whose nextRun is due (<= now).
 * A rule can generate several transactions if it has been due multiple times.
 * Returns the number of transactions created.
 */
export async function processDueRecurring(now: Date = new Date()): Promise<number> {
  const due = await RecurringTransaction.find({ active: true, nextRun: { $lte: now } });
  let created = 0;

  for (const rule of due) {
    created += await postDueForRule(rule as unknown as RuleDoc, now);
    await rule.save();
  }

  return created;
}

/**
 * Post the due occurrences for a single rule (used by the "run now" per-rule action).
 * Returns the number of transactions created, or null if the rule doesn't exist.
 */
export async function runRule(id: string, now: Date = new Date()): Promise<number | null> {
  const rule = await RecurringTransaction.findById(id);
  if (!rule) return null;
  const created = await postDueForRule(rule as unknown as RuleDoc, now);
  await rule.save();
  return created;
}

/**
 * Skip the next scheduled occurrence of a rule without posting a transaction:
 * advance nextRun by one interval (deactivating if that passes endDate).
 * Returns the updated rule, or null if it doesn't exist.
 */
export async function skipNextOccurrence(id: string): Promise<RuleDoc | null> {
  const rule = await RecurringTransaction.findById(id);
  if (!rule) return null;
  const next = advance(new Date(rule.nextRun), rule.frequency, rule.interval);
  rule.nextRun = next;
  if (rule.endDate && next > rule.endDate) rule.active = false;
  await rule.save();
  return rule as unknown as RuleDoc;
}
