import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Holding } from "../models/Holding";
import { Goal } from "../models/Goal";
import { Transaction } from "../models/Transaction";
import { RecurringTransaction, RECURRENCE_FREQUENCIES } from "../models/RecurringTransaction";
import { HttpError } from "../middleware/errorHandler";
import { round2 } from "./portfolioService";
import { advance, nextRunFrom } from "./recurringService";

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
  /**
   * How many instalments in all — the term the user agreed with the bank. It
   * decides when the schedule ends, so the rule stops on its own after the last
   * payment instead of running until someone notices.
   */
  termCount?: number | null;
  /** An explicit end, when there is no fixed term (an open-ended savings pot). */
  endDate?: Date | null;
}

/**
 * The date the last instalment of a fixed term falls on.
 *
 * A 12-month RD starting in September pays in September and then eleven more
 * times — so the last one is eleven intervals out, not twelve. Off by one here
 * and the deposit either stops a month early or takes a thirteenth payment.
 */
export function termEndDate(
  start: Date,
  frequency: InstalmentInput["frequency"],
  interval: number,
  termCount: number
): Date {
  let end = new Date(start);
  for (let i = 1; i < Math.max(1, termCount); i += 1) end = advance(end, frequency, interval);
  return end;
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

/** Instalments actually paid into each holding, keyed by holding id. */
export async function progressFor(uid: unknown, holdingIds: unknown[]) {
  const out = new Map<string, { count: number; total: number; imported: number }>();
  if (holdingIds.length === 0) return out;

  // Only the legs that put money IN. A withdrawal carries a negative
  // contribution, and counting it would let a payout undo the progress bar
  // rather than complete it. Imported past payments count, because they were
  // instalments — that is what importing them said.
  const rows = await Transaction.aggregate([
    { $match: { user: new Types.ObjectId(String(uid)), holding: { $in: holdingIds }, holdingContribution: { $gt: 0 } } },
    {
      $group: {
        _id: "$holding",
        count: { $sum: 1 },
        total: { $sum: "$holdingContribution" },
        // How many were rewritten from past expenses — the ones an undo could
        // put back, and the only reason to offer one.
        imported: { $sum: { $cond: [{ $ifNull: ["$adoptedFrom", false] }, 1, 0] } },
      },
    },
  ]);
  for (const r of rows)
    out.set(String(r._id), { count: r.count, total: round2(r.total), imported: r.imported });
  return out;
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
  // A fixed term owns the end date: the schedule stops after the agreed number
  // of payments, whatever else the holding says about maturity.
  const endDate = input.termCount
    ? termEndDate(start, input.frequency, input.interval, input.termCount)
    : (input.endDate ?? null);
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
      endDate,
      active: !(endDate && nextRun > endDate),
    });
    return rule.toObject();
  }

  existing.amount = input.amount;
  existing.payee = payee;
  existing.account = account._id as Types.ObjectId;
  existing.frequency = input.frequency;
  existing.interval = input.interval;
  existing.endDate = endDate;
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

/**
 * Recurring rules that could be an RD the user set up before deposits existed —
 * ones not already spoken for by a loan, a goal, a SIP or another deposit.
 *
 * Income rules are excluded: money arriving isn't an instalment.
 */
export async function unlinkedRules(uid: unknown) {
  return RecurringTransaction.find({
    user: uid,
    holding: null,
    goal: null,
    loan: null,
    fund: null,
    type: { $ne: "income" },
  })
    .sort({ nextRun: 1 })
    .populate([
      { path: "account", select: "name color icon" },
      { path: "category", select: "name color icon" },
    ])
    .lean();
}

/**
 * How many instalments a schedule that ends on `endDate` will have run in all.
 *
 * Used when adopting a rule the user built by hand: they already told the app
 * when it ends, so the term is a fact to be read off rather than a question to
 * ask them again.
 */
export function termFromEnd(
  start: Date,
  end: Date,
  frequency: InstalmentInput["frequency"],
  interval: number
): number {
  let count = 0;
  let at = new Date(start);
  // 600 is the schema's ceiling; the guard is against a zero interval, not a
  // long deposit.
  while (at <= end && count < 600) {
    count += 1;
    at = advance(at, frequency, interval);
  }
  return count;
}

/**
 * Adopt a recurring rule the user built by hand into a deposit.
 *
 * Someone who has been running an RD since before any of this existed has a
 * rule that posts ₹7,000 a month as an expense, and a pile of transactions to
 * match. Re-creating the schedule here would leave them with two rules and
 * double the outgoings. So the existing rule is claimed rather than replaced:
 * it keeps its id, its position in the schedule and its history, and the
 * payments it has already posted are rewritten as instalments of the deposit.
 */
export async function linkRuleToHolding(uid: string, holdingId: unknown, ruleId: string) {
  const holding = await Holding.findOne({ _id: holdingId, user: uid });
  if (!holding) throw new HttpError(404, "Holding not found", "HOLDING_NOT_FOUND");

  const existing = await RecurringTransaction.findOne({ user: uid, holding: holdingId });
  if (existing) {
    throw new HttpError(
      400,
      "This deposit already has a schedule. Switch it off before linking another rule.",
      "DEPOSIT_ALREADY_SCHEDULED"
    );
  }

  const rule = await RecurringTransaction.findOne({ _id: ruleId, user: uid });
  if (!rule) throw new HttpError(404, "Recurring transaction not found", "RECURRING_NOT_FOUND");
  if (rule.holding) throw new HttpError(400, "That rule already feeds a deposit", "RULE_ALREADY_LINKED");
  if (rule.goal || rule.loan || rule.fund) {
    throw new HttpError(
      400,
      "That rule already pays a loan, a goal or a SIP",
      "RULE_ALREADY_COMMITTED"
    );
  }

  rule.holding = holding._id as Types.ObjectId;
  // The deposit path posts its own leg, so these stop being the rule's business.
  rule.type = "expense";
  rule.category = null;
  rule.toAccount = null;
  rule.payee = holding.name;
  await rule.save();

  // The rule already said when it ends, so the term is read off rather than
  // asked for again.
  if (!holding.termCount && rule.endDate) {
    holding.termCount = termFromEnd(rule.startDate, rule.endDate, rule.frequency, rule.interval);
    await holding.save();
  }

  return { rule: rule.toObject(), termCount: holding.termCount ?? null };
}

/**
 * The goal a recurring deposit already is.
 *
 * An RD states a target (the instalments together), a deadline (the last one)
 * and progress (what it holds) — which is a goal with different words on it.
 * Rather than ask someone to type the same three facts into the Goals page, the
 * deposit can carry one, and the goal reads the deposit instead of keeping its
 * own drifting copy.
 *
 * It's a choice, not automatic: a standing order into an emergency fund is a
 * habit rather than a goal, and a Goals page full of things nobody set as goals
 * is worse than one that's empty.
 *
 * Progress is derived (`Goal.linkedHolding`), so no contribution is ever stored
 * against it — the same rule that stops a wallet-tracking goal counting the same
 * rupees twice.
 */
export async function syncDepositGoal(
  uid: unknown,
  holdingId: unknown,
  wanted: boolean
): Promise<Record<string, unknown> | null> {
  const existing = await Goal.findOne({ user: uid, linkedHolding: holdingId });

  if (!wanted) {
    if (existing) await Goal.deleteOne({ _id: existing._id });
    return null;
  }

  const holding = await Holding.findOne({ _id: holdingId, user: uid });
  if (!holding) return null;
  const rule = await RecurringTransaction.findOne({ user: uid, holding: holdingId });

  // What the deposit is aiming at: every instalment, added up. Interest is
  // deliberately left out — the goal is what you set out to put in, and the
  // payout is worth more than that by design.
  const term = holding.termCount ?? 0;
  const target = rule && term ? round2(rule.amount * term) : (holding.maturityValue ?? holding.value ?? 0);
  if (!target) return null;

  const targetDate =
    rule && term
      ? termEndDate(rule.startDate, rule.frequency, rule.interval, term)
      : (holding.maturityDate ?? null);

  if (existing) {
    existing.name = holding.name;
    existing.targetAmount = target;
    existing.targetDate = targetDate;
    await existing.save();
    return existing.toObject();
  }

  const goal = await Goal.create({
    user: uid,
    name: holding.name,
    targetAmount: target,
    linkedHolding: holding._id,
    targetDate,
    // A deposit runs once and matures; it is not a sinking fund that restarts.
    repeat: "none",
    currency: holding.currency,
    icon: "piggy-bank",
    color: "#14B8A6",
  });
  return goal.toObject();
}
