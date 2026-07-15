import { RecurringTransaction, type RecurringDoc } from "../models/RecurringTransaction";
import { Transaction } from "../models/Transaction";
import { applyLoanPayment } from "./loanService";
import { applyGoalContribution } from "./goalService";
import { notify } from "./notificationService";
import { ruleTitle, postedDedupeKey, endedDedupeKey } from "./notificationLogic";
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

    const posted = await Transaction.create({
      user: rule.user,
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
      loan: rule.loan,
      goal: rule.goal,
    });
    let touched = false;
    if (rule.loan) {
      const { principal, interest } = await applyLoanPayment(rule.loan, rule.user, rule.amount);
      posted.loanPrincipal = principal;
      posted.loanInterest = interest;
      touched = true;
    }
    if (rule.goal) {
      posted.goalContribution = await applyGoalContribution(rule.goal, rule.user, rule.amount);
      touched = true;
    }
    if (touched) await posted.save();
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
 * Materialize recurring rules whose nextRun is due (<= now). The hourly cron calls this
 * with no userId (all users, stamping each posted txn with its rule's owner); the
 * user-facing "Run due" button passes a userId to process only that user's rules.
 * Returns the number of transactions created.
 */
export async function processDueRecurring(now: Date = new Date(), userId?: string): Promise<number> {
  const filter: Record<string, unknown> = { active: true, nextRun: { $lte: now } };
  if (userId) filter.user = userId;
  const due = await RecurringTransaction.find(filter);
  let created = 0;

  for (const rule of due) {
    const doc = rule as unknown as RuleDoc;
    const wasActive = doc.active;
    const createdForRule = await postDueForRule(doc, now);
    created += createdForRule;
    await rule.save();
    // Only the automatic (all-users) cron path raises notifications. A user-initiated
    // "Run due" already shows a toast, so it stays notification-free to avoid duplicate
    // feedback for an action they just performed.
    if (!userId) await notifyRulePosted(doc, wasActive, createdForRule);
  }

  return created;
}

/** Emit the recurring.posted / recurring.ended notifications after a cron post. */
async function notifyRulePosted(
  rule: RuleDoc,
  wasActive: boolean,
  created: number
): Promise<void> {
  try {
    if (created > 0 && rule.lastRun) {
      await notify({
        user: rule.user,
        type: "recurring.posted",
        params: {
          count: created,
          ruleTitle: ruleTitle(rule),
          amount: rule.amount,
          currency: rule.currency,
          type: rule.type,
        },
        link: "/recurring",
        recurring: rule._id,
        dedupeKey: postedDedupeKey(String(rule._id), new Date(rule.lastRun)),
      });
    }
    if (wasActive && !rule.active) {
      await notify({
        user: rule.user,
        type: "recurring.ended",
        params: { ruleTitle: ruleTitle(rule) },
        link: "/recurring",
        recurring: rule._id,
        dedupeKey: endedDedupeKey(String(rule._id)),
      });
    }
  } catch (e) {
    // A notification failure must never abort the cron's posting work.
    console.error("[notify] recurring post notification failed for rule", String(rule._id), e);
  }
}

/**
 * Post the due occurrences for a single rule owned by the user (per-rule "run now").
 * Returns the number of transactions created, or null if the rule doesn't exist / isn't theirs.
 */
export async function runRule(id: string, userId: string, now: Date = new Date()): Promise<number | null> {
  const rule = await RecurringTransaction.findOne({ _id: id, user: userId });
  if (!rule) return null;
  const created = await postDueForRule(rule as unknown as RuleDoc, now);
  await rule.save();
  return created;
}

/**
 * Post exactly ONE occurrence of a user's rule (optionally overriding amount/date),
 * link it to the rule, then advance nextRun by one interval. Used by the dashboard
 * "Post" confirmation where the user may tweak the amount/date before posting.
 * Returns the updated rule, or null if it doesn't exist / isn't theirs.
 */
export async function postOneOccurrence(
  id: string,
  userId: string,
  opts: { amount?: number; date?: Date } = {}
): Promise<RuleDoc | null> {
  const rule = await RecurringTransaction.findOne({ _id: id, user: userId });
  if (!rule) return null;

  const date = opts.date ? new Date(opts.date) : new Date(rule.nextRun);
  const amount = opts.amount != null ? opts.amount : rule.amount;

  const posted = await Transaction.create({
    user: rule.user,
    type: rule.type,
    amount,
    account: rule.account,
    toAccount: rule.toAccount,
    category: rule.category,
    date,
    note: rule.note,
    payee: rule.payee,
    tags: rule.tags,
    currency: rule.currency,
    recurring: rule._id,
    loan: rule.loan,
    goal: rule.goal,
  });
  let touched = false;
  if (rule.loan) {
    const { principal, interest } = await applyLoanPayment(rule.loan, rule.user, amount);
    posted.loanPrincipal = principal;
    posted.loanInterest = interest;
    touched = true;
  }
  if (rule.goal) {
    posted.goalContribution = await applyGoalContribution(rule.goal, rule.user, amount);
    touched = true;
  }
  if (touched) await posted.save();

  rule.lastRun = date;
  const next = advance(new Date(rule.nextRun), rule.frequency, rule.interval);
  rule.nextRun = next;
  if (rule.endDate && next > rule.endDate) rule.active = false;
  await rule.save();
  return rule as unknown as RuleDoc;
}

/**
 * Skip the next scheduled occurrence of a user's rule without posting a transaction:
 * advance nextRun by one interval (deactivating if that passes endDate).
 * Returns the updated rule, or null if it doesn't exist / isn't theirs.
 */
export async function skipNextOccurrence(id: string, userId: string): Promise<RuleDoc | null> {
  const rule = await RecurringTransaction.findOne({ _id: id, user: userId });
  if (!rule) return null;
  const next = advance(new Date(rule.nextRun), rule.frequency, rule.interval);
  rule.nextRun = next;
  if (rule.endDate && next > rule.endDate) rule.active = false;
  await rule.save();
  return rule as unknown as RuleDoc;
}
