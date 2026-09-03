import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Holding } from "../models/Holding";
import { RecurringTransaction, RECURRENCE_FREQUENCIES } from "../models/RecurringTransaction";
import { HttpError } from "../middleware/errorHandler";
import { nextRunFrom } from "./recurringService";

/**
 * The standing order that feeds a deposit — an RD instalment, or any regular
 * payment into an FD or a savings pot.
 *
 * A recurring deposit is one fact about the world: "₹1,000 leaves HDFC on the
 * 3rd of every month and becomes part of this deposit." Expressing it used to
 * take two screens and five decisions, three of which the app then discarded —
 * the rule's type, its category and its destination account are all overridden
 * by depositService when the run happens. Asking for them was noise.
 *
 * So the schedule is owned by the holding: you describe it on the deposit, and
 * this module keeps exactly one recurring rule in step with what you said. The
 * rule is still an ordinary rule — it appears on the Recurring page, it can be
 * posted early or skipped, and processDueRecurring runs it the same way as any
 * other. It simply isn't something you have to assemble by hand.
 *
 * Invariant: at most one rule per holding. That is what makes the deposit's own
 * form a truthful view of the schedule rather than a guess at which of several
 * rules was meant.
 */

/** How the money arrives. Everything the user actually has an opinion about. */
export interface InstalmentInput {
  amount: number;
  account: string;
  frequency: (typeof RECURRENCE_FREQUENCIES)[number];
  interval: number;
  startDate: Date;
  /** Usually the maturity date — after it, nothing more is due. */
  endDate?: Date | null;
}

/** The rules that fund each of these holdings, keyed by holding id. */
export async function instalmentsFor(uid: unknown, holdingIds: unknown[]) {
  if (holdingIds.length === 0) return new Map<string, Record<string, unknown>>();
  const rules = await RecurringTransaction.find({
    user: uid,
    holding: { $in: holdingIds },
  })
    .populate({ path: "account", select: "name color icon" })
    .lean();

  const byHolding = new Map<string, Record<string, unknown>>();
  for (const rule of rules) byHolding.set(String(rule.holding), rule as Record<string, unknown>);
  return byHolding;
}

/**
 * When the first instalment falls due.
 *
 * Two mistakes to avoid, in opposite directions. A start date already in the
 * past must not fire a burst of catch-up instalments the moment the rule runs —
 * the ones already paid belong to "Import past payments", not to a new schedule.
 * But "starting today" must mean today, not next month, so the comparison is by
 * day rather than by timestamp: a date typed as today is not "in the past"
 * merely because midnight has been and gone.
 */
export function firstRun(
  start: Date,
  frequency: InstalmentInput["frequency"],
  interval: number,
  now: Date = new Date()
): Date {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return start >= today ? start : nextRunFrom(start, frequency, interval, now);
}

/** The funding account, verified — and never one of the app's own buckets. */
async function requireFundingAccount(uid: unknown, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new HttpError(400, "Pick an account", "ACCOUNT_NOT_FOUND");
  const account = await Account.findOne({ _id: id, user: uid });
  if (!account) throw new HttpError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  if (account.system || account.type === "securities" || account.type === "deposits") {
    throw new HttpError(400, "That account is managed by the app", "ACCOUNT_SYSTEM_MANAGED");
  }
  return account;
}

/**
 * Make the holding's schedule match `input`: create the rule, update it in place,
 * or remove it when `input` is null.
 *
 * Updating in place matters. Deleting and recreating would hand the rule a new
 * id, orphaning the `recurring` link on every instalment it had already posted,
 * and would reset the schedule's position — so an edit to the amount could
 * quietly re-post months that were already paid.
 */
export async function syncInstalment(
  uid: unknown,
  holdingId: unknown,
  input: InstalmentInput | null
) {
  const existing = await RecurringTransaction.findOne({ user: uid, holding: holdingId });

  if (!input) {
    if (existing) await RecurringTransaction.deleteOne({ _id: existing._id });
    return null;
  }

  const account = await requireFundingAccount(uid, input.account);
  const start = new Date(input.startDate);
  const now = new Date();
  // The deposit names the rule. Without it the Recurring page and every
  // notification would say "Recurring" — a rule the app created for you, that
  // can't tell you what it's for.
  const payee = (await Holding.findOne({ _id: holdingId, user: uid }).select("name").lean())?.name ?? "";

  if (!existing) {
    const nextRun = firstRun(start, input.frequency, input.interval, now);
    const rule = await RecurringTransaction.create({
      user: uid,
      // The type is a formality: the deposit branch of processDueRecurring
      // intercepts before any ordinary transaction is built, and posts a
      // transfer into the Savings & Deposits bucket instead. "expense" is the
      // honest label for the cash-flow forecast — the money does leave the bank.
      type: "expense",
      amount: input.amount,
      account: account._id,
      toAccount: null,
      category: null,
      holding: holdingId,
      payee,
      frequency: input.frequency,
      interval: input.interval,
      startDate: start,
      nextRun,
      endDate: input.endDate ?? null,
      active: !(input.endDate && nextRun > new Date(input.endDate)),
    });
    return rule.toObject();
  }

  existing.amount = input.amount;
  existing.payee = payee;
  existing.account = account._id as Types.ObjectId;
  existing.frequency = input.frequency;
  existing.interval = input.interval;
  existing.endDate = input.endDate ?? null;
  // Re-anchor only when the start date genuinely moved — the same rule the
  // Recurring form follows, so editing an amount never disturbs what's due next.
  if (+start !== +existing.startDate) {
    existing.startDate = start;
    existing.nextRun = firstRun(start, input.frequency, input.interval, now);
  }
  if (existing.endDate && existing.nextRun > existing.endDate) existing.active = false;
  await existing.save();
  return existing.toObject();
}
