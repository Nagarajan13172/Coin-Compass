import { RecurringTransaction } from "../models/RecurringTransaction";
import { Transaction } from "../models/Transaction";
import { addDays, addMonths, addYears } from "../utils/dateRange";

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

/**
 * Materialize every recurring rule whose nextRun is due (<= now).
 * A rule can generate several transactions if it has been due multiple times.
 * Returns the number of transactions created.
 */
export async function processDueRecurring(now: Date = new Date()): Promise<number> {
  const due = await RecurringTransaction.find({ active: true, nextRun: { $lte: now } });
  let created = 0;

  for (const rule of due) {
    let next = new Date(rule.nextRun);
    const guardMax = 500; // safety against runaway loops
    let iterations = 0;

    while (next <= now && iterations < guardMax) {
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
      });
      created += 1;
      rule.lastRun = new Date(next);
      next = advance(next, rule.frequency, rule.interval);
      iterations += 1;
    }

    rule.nextRun = next;
    if (rule.endDate && next > rule.endDate) rule.active = false;
    await rule.save();
  }

  return created;
}
