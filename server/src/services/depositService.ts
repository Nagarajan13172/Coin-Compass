import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Holding } from "../models/Holding";
import { Transaction } from "../models/Transaction";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { HttpError } from "../middleware/errorHandler";
import { round2 } from "./portfolioService";

/**
 * Savings deposits — RDs, FDs, an emergency-fund pot — and the ledger entries
 * that keep them honest.
 *
 * The problem this exists to fix: paying ₹5,000 into a recurring deposit was
 * recorded as an EXPENSE, so net worth fell by ₹5,000 the moment the user saved
 * ₹5,000. But that money did not leave the user — it changed shape, from cash in
 * a bank account into a deposit. A deposit is an asset.
 *
 * So a payment into a deposit is a TRANSFER, not a spend: cash leaves the funding
 * account and lands in an auto-managed "Savings & Deposits" bucket, while the
 * Holding's value rises by the same amount. Net worth doesn't move — which is the
 * truth — and the payment never reaches a spending chart or a budget, because
 * transfers are excluded from both.
 *
 * The bucket account is excluded from totals: the Holding already carries the
 * value into net worth, so counting the bucket too would double it. This is the
 * same shape stockService uses for the "Stock Investments" bucket and the Credits
 * feature uses for "Money Lent" — same problem, same solution.
 *
 * Invariant: the bucket's balance equals the ledger-contributed principal of
 * every holding. `Transaction.holdingContribution` is the signed amount each leg
 * applied, so an edit or a delete reverses exactly what happened.
 */

/** The auto-managed counterparty for every deposit payment and withdrawal. */
const DEPOSITS_ACCOUNT = {
  system: "deposits",
  name: "Savings & Deposits",
  type: "deposits",
  icon: "piggy-bank",
  color: "#14B8A6",
} as const;

/** Interest a deposit paid out, booked as real income. */
const INTEREST_CATEGORY = {
  system: "deposit_interest",
  name: "Deposit Interest",
  type: "income",
  icon: "percent",
  color: "#14B8A6",
  group: "returns",
} as const;

/**
 * Subtypes whose value is derived from lots priced at market (stockService and
 * fundService own those ledgers). Paying into them here would double-count, so
 * they are refused and the user is pointed at the page that owns them.
 */
const LOT_OWNED_SUBTYPES: Record<string, string> = {
  stocks: "Stocks",
  mutual_funds: "Funds",
};

/** Find — or lazily create — the user's Savings & Deposits bucket. */
export async function ensureDepositsAccount(uid: unknown): Promise<Types.ObjectId> {
  const existing = await Account.findOne({ user: uid, system: DEPOSITS_ACCOUNT.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Account.create({
    user: uid,
    name: DEPOSITS_ACCOUNT.name,
    type: DEPOSITS_ACCOUNT.type,
    icon: DEPOSITS_ACCOUNT.icon,
    color: DEPOSITS_ACCOUNT.color,
    system: DEPOSITS_ACCOUNT.system,
    initialBalance: 0,
    // The holdings carry the value into net worth. Counting this account too
    // would add the deposited principal on top of it.
    includeInTotal: false,
  });
  return created._id as Types.ObjectId;
}

/** Find — or lazily create — the "Deposit Interest" income category. */
export async function ensureInterestCategory(uid: unknown): Promise<Types.ObjectId> {
  const existing = await Category.findOne({ user: uid, system: INTEREST_CATEGORY.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Category.create({
    user: uid,
    name: INTEREST_CATEGORY.name,
    type: INTEREST_CATEGORY.type,
    icon: INTEREST_CATEGORY.icon,
    color: INTEREST_CATEGORY.color,
    group: INTEREST_CATEGORY.group,
    system: INTEREST_CATEGORY.system,
  });
  return created._id as Types.ObjectId;
}

// ---- Pure arithmetic (unit-tested in depositService.test.ts) ----

/** A holding's two money figures. `invested` is null when never recorded. */
export interface DepositState {
  value: number;
  invested: number | null;
}

export interface DepositResult extends DepositState {
  /** How much of the requested change actually landed. */
  applied: number;
}

/**
 * Apply a signed change to a deposit: positive pays in, negative takes out.
 *
 * `applied` may be smaller in magnitude than `delta` — a withdrawal can never
 * take out more principal than the deposit holds, since a holding's value cannot
 * go negative. Callers store `applied`, not `delta`, so reversing it is exact.
 *
 * A holding with no `investedAmount` yet adopts its current value as its cost
 * basis before the change lands. For a new deposit (value 0) that starts the
 * count at zero, which is right; for one added by hand at ₹1,00,000 it assumes
 * that figure was principal rather than principal plus accrued interest — the
 * best available guess, and editable on the holding.
 */
export function applyDeposit(state: DepositState, delta: number): DepositResult {
  const value = Math.max(0, state.value);
  const applied = round2(Math.max(delta, -value));
  const invested = state.invested ?? value;
  return {
    value: round2(value + applied),
    invested: Math.max(0, round2(invested + applied)),
    applied,
  };
}

/**
 * Split cash coming OUT of a deposit into the principal being returned and the
 * interest earned on top of it.
 *
 * A matured RD that took ₹60,000 of instalments and pays out ₹62,000 returns
 * ₹60,000 of principal — which merely changes shape, so net worth is unmoved —
 * and ₹2,000 of interest, which is genuine income and should read as such. A
 * partial withdrawal that stays within the principal earns nothing.
 */
export function splitWithdrawal(principalHeld: number, amount: number): { principal: number; interest: number } {
  const held = Math.max(0, principalHeld);
  const gross = Math.max(0, amount);
  const principal = round2(Math.min(gross, held));
  return { principal, interest: round2(gross - principal) };
}

// ---- Ledger operations ----

/** The user's holding, verified as one that can take deposits. */
export async function requireDepositHolding(uid: string, id: unknown) {
  const holding = await Holding.findOne({ _id: id, user: uid });
  if (!holding) throw new HttpError(404, "Holding not found", "HOLDING_NOT_FOUND");
  const owner = LOT_OWNED_SUBTYPES[holding.subtype];
  if (owner) {
    throw new HttpError(
      400,
      `${holding.name} is valued from its lots. Record this on the ${owner} page instead.`,
      "HOLDING_LOT_OWNED",
      { name: holding.name, owner }
    );
  }
  return holding;
}

/** A real account of the user's, verified. Refuses the auto-managed buckets. */
async function requireFundingAccount(uid: string, id: unknown) {
  const account = await Account.findOne({ _id: id, user: uid });
  if (!account) throw new HttpError(404, "Account not found", "ACCOUNT_NOT_FOUND");
  if (account.type === "securities" || account.type === "deposits") {
    throw new HttpError(400, "That account is managed by the app", "ACCOUNT_SYSTEM_MANAGED");
  }
  return account;
}

/**
 * Move `delta` onto a holding's value and report how much actually landed.
 * Positive pays in, negative takes out. Mirrors applyGoalContribution.
 */
export async function applyHoldingContribution(holdingId: unknown, uid: unknown, delta: number): Promise<number> {
  if (!holdingId || !delta) return 0;
  const holding = await Holding.findOne({ _id: holdingId, user: uid });
  if (!holding) return 0;
  const next = applyDeposit({ value: holding.value ?? 0, invested: holding.investedAmount ?? null }, delta);
  holding.value = next.value;
  holding.investedAmount = next.invested;
  await holding.save();
  return next.applied;
}

/** Undo exactly what `applyHoldingContribution` applied. */
export async function reverseHoldingContribution(holdingId: unknown, uid: unknown, applied: number): Promise<void> {
  if (!holdingId || !applied) return;
  await applyHoldingContribution(holdingId, uid, -applied);
}

export interface DepositInput {
  holding: string;
  /** Where the money comes from. */
  account: string;
  amount: number;
  date: Date;
  note?: string;
  /** Set when a recurring rule posted this instalment. */
  recurring?: unknown;
}

/**
 * Pay into a deposit. Posts one transfer — funding account → Deposits bucket —
 * and raises the holding by the same amount. Net worth is unchanged, which is
 * the whole point: saving is not spending.
 */
export async function depositToHolding(uid: string, input: DepositInput) {
  const holding = await requireDepositHolding(uid, input.holding);
  const account = await requireFundingAccount(uid, input.account);
  const amount = round2(input.amount);
  if (amount <= 0) throw new HttpError(400, "Enter an amount to pay in", "DEPOSIT_NO_AMOUNT");

  const bucket = await ensureDepositsAccount(uid);
  const applied = await applyHoldingContribution(holding._id, uid, amount);

  const txn = await Transaction.create({
    user: uid,
    type: "transfer",
    amount,
    account: account._id,
    toAccount: bucket,
    date: input.date,
    note: input.note || `Paid into ${holding.name}`,
    payee: holding.provider || holding.name,
    currency: holding.currency,
    holding: holding._id,
    holdingContribution: applied,
    recurring: input.recurring ?? null,
  });

  return { transaction: txn.toObject(), holding: holding.toObject() };
}

export interface WithdrawInput {
  holding: string;
  /** Where the proceeds land. */
  account: string;
  amount: number;
  date: Date;
  note?: string;
  /** Close the holding out entirely (a matured FD/RD). */
  close?: boolean;
}

/**
 * Take money out of a deposit — a maturity payout, or a partial withdrawal.
 *
 * Posts up to two legs, mirroring how a fund redemption separates capital from
 * gain: the principal comes back as a transfer (no income, net worth flat), and
 * anything above the principal is booked as Deposit Interest income. A payout
 * that is pure principal posts one leg only.
 */
export async function withdrawFromHolding(uid: string, input: WithdrawInput) {
  const holding = await requireDepositHolding(uid, input.holding);
  const account = await requireFundingAccount(uid, input.account);
  const amount = round2(input.amount);
  if (amount <= 0) throw new HttpError(400, "Enter an amount to withdraw", "DEPOSIT_NO_AMOUNT");

  const bucket = await ensureDepositsAccount(uid);
  const { principal, interest } = splitWithdrawal(holding.value ?? 0, amount);
  const applied = await applyHoldingContribution(holding._id, uid, -principal);
  const label = input.note || `Withdrawn from ${holding.name}`;

  // Leg 1 — principal returned from the bucket to the receiving account.
  if (principal > 0) {
    await Transaction.create({
      user: uid,
      type: "transfer",
      amount: principal,
      account: bucket,
      toAccount: account._id,
      date: input.date,
      note: label,
      payee: holding.provider || holding.name,
      currency: holding.currency,
      holding: holding._id,
      holdingContribution: applied,
    });
  }

  // Leg 2 — interest earned. Real income: money the user did not have before, so
  // it lifts net worth and belongs in the income charts.
  if (interest > 0) {
    const category = await ensureInterestCategory(uid);
    await Transaction.create({
      user: uid,
      type: "income",
      amount: interest,
      account: account._id,
      category,
      date: input.date,
      note: `Interest from ${holding.name}`,
      payee: holding.provider || holding.name,
      currency: holding.currency,
      holding: holding._id,
      // The interest was never part of the principal, so this leg moves the
      // holding's value by nothing. Only the transfer leg above does.
      holdingContribution: 0,
    });
  }

  if (input.close) await Holding.deleteOne({ _id: holding._id, user: uid });
  return { principal, interest, closed: Boolean(input.close) };
}

/**
 * Past expenses that look like payments into this deposit: spends from the
 * savings category group, or ones whose note or payee names the holding. Newest
 * first, so the most recent instalments are the easiest to pick.
 */
export async function depositCandidates(uid: string, holdingId: string, limit = 60) {
  const holding = await requireDepositHolding(uid, holdingId);
  const savingsCategories = await Category.find({ user: uid, group: "savings" }).select("_id").lean();
  const name = holding.name.trim();
  const rx = name ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;

  const or: Record<string, unknown>[] = [{ category: { $in: savingsCategories.map((c) => c._id) } }];
  if (rx) or.push({ note: rx }, { payee: rx });
  // Anything the deposit's own rule has already posted. When a rule built by
  // hand is adopted, these are not a guess at which expenses might have been
  // instalments — they are its instalments, by construction.
  const rule = await RecurringTransaction.findOne({ user: uid, holding: holding._id }).select("_id").lean();
  if (rule) or.push({ recurring: rule._id });

  return Transaction.find({ user: uid, type: "expense", holding: null, $or: or })
    .sort({ date: -1 })
    .limit(limit)
    .populate([
      { path: "account", select: "name color icon" },
      { path: "category", select: "name color icon" },
    ])
    .lean();
}

/**
 * Reclassify expenses that were really deposits.
 *
 * Every RD instalment recorded before this feature existed sits in the ledger as
 * a spend, dragging down both the spending charts and net worth. This rewrites
 * them in place — same account, same date, same amount — as transfers into the
 * holding, so the history reads correctly instead of being duplicated by a fresh
 * set of deposits.
 *
 * Only plain expenses are eligible: anything already carrying a loan, credit,
 * split, goal, stock or fund link owns effects this cannot safely rewrite.
 */
export async function adoptTransactions(uid: string, holdingId: string, ids: string[]) {
  const holding = await requireDepositHolding(uid, holdingId);
  const bucket = await ensureDepositsAccount(uid);

  const rows = await Transaction.find({
    _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)) },
    user: uid,
    type: "expense",
    holding: null,
    loan: null,
    credit: null,
    split: null,
    goal: null,
    stockLot: null,
    stockSale: null,
    fundLot: null,
    fundRedemption: null,
  });

  let adopted = 0;
  let total = 0;
  for (const txn of rows) {
    const applied = await applyHoldingContribution(holding._id, uid, txn.amount);
    // Remembered before it's overwritten, so this can be taken back. Importing
    // the wrong row is easy — the candidates are partly a guess — and without
    // this the original category is simply gone.
    txn.adoptedFrom = { type: txn.type, category: txn.category, oneoff: txn.oneoff };
    txn.type = "transfer";
    txn.toAccount = bucket;
    txn.category = null;
    txn.oneoff = false;
    txn.holding = holding._id as Types.ObjectId;
    txn.holdingContribution = applied;
    await txn.save();
    adopted += 1;
    total = round2(total + txn.amount);
  }

  return { adopted, total, holding: await Holding.findById(holding._id).lean() };
}

/**
 * Put back the expenses an import rewrote.
 *
 * Importing makes a claim about the past — that these spends were really money
 * going into a deposit. When the claim is wrong, undoing it has to restore what
 * was there, not merely unlink it: an instalment that reverts to an
 * uncategorised transfer is no more correct than one left as a spend.
 *
 * Only transactions carrying `adoptedFrom` are touched, so deposits recorded as
 * deposits from the start are never disturbed by this.
 */
export async function undoAdoption(uid: string, holdingId: string) {
  const holding = await requireDepositHolding(uid, holdingId);
  const rows = await Transaction.find({
    user: uid,
    holding: holding._id,
    adoptedFrom: { $ne: null },
  });

  let restored = 0;
  let total = 0;
  for (const txn of rows) {
    const prior = txn.adoptedFrom!;
    // Take back exactly what this leg put in — not the amount, which an edit
    // may since have changed.
    await reverseHoldingContribution(holding._id, uid, txn.holdingContribution);
    txn.type = prior.type as "expense" | "income" | "transfer";
    txn.category = prior.category ?? null;
    txn.oneoff = prior.oneoff ?? false;
    txn.toAccount = null;
    txn.holding = null;
    txn.holdingContribution = 0;
    txn.adoptedFrom = null;
    await txn.save();
    restored += 1;
    total = round2(total + txn.amount);
  }

  return { restored, total, holding: await Holding.findById(holding._id).lean() };
}
