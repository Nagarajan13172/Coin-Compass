import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";

export interface AccountBalance {
  account: string;
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  /** initialBalance + income - expense + transferIn - transferOut */
  balance: number;
  initialBalance: number;
}

/**
 * Compute live balances for every account of a user from its transactions.
 * Returns a map keyed by account id (string).
 */
export async function computeAllBalances(userId: string): Promise<Map<string, AccountBalance>> {
  const user = new Types.ObjectId(userId);
  const accounts = await Account.find({ user }).lean();
  const map = new Map<string, AccountBalance>();
  for (const a of accounts) {
    map.set(String(a._id), {
      account: String(a._id),
      income: 0,
      expense: 0,
      transferIn: 0,
      transferOut: 0,
      balance: 0,
      initialBalance: a.initialBalance ?? 0,
    });
  }

  // Income & expense, and transfers OUT, grouped by source account.
  const fromAgg = await Transaction.aggregate<{
    _id: { account: Types.ObjectId; type: string };
    total: number;
  }>([
    { $match: { user } },
    { $group: { _id: { account: "$account", type: "$type" }, total: { $sum: "$amount" } } },
  ]);

  for (const row of fromAgg) {
    const key = String(row._id.account);
    const entry = map.get(key);
    if (!entry) continue;
    if (row._id.type === "income") entry.income += row.total;
    else if (row._id.type === "expense") entry.expense += row.total;
    else if (row._id.type === "transfer") entry.transferOut += row.total;
  }

  // Transfers IN, grouped by destination account.
  const toAgg = await Transaction.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { user, type: "transfer", toAccount: { $ne: null } } },
    { $group: { _id: "$toAccount", total: { $sum: "$amount" } } },
  ]);

  for (const row of toAgg) {
    const entry = map.get(String(row._id));
    if (!entry) continue;
    entry.transferIn += row.total;
  }

  for (const entry of map.values()) {
    entry.balance =
      entry.initialBalance + entry.income - entry.expense + entry.transferIn - entry.transferOut;
  }

  return map;
}

export interface LedgerSnapshot {
  /**
   * Closing balance per account id. Transfers count here (they're what moves
   * money between a real account and the "Money Lent" receivable), so lending
   * ₹20k shows the bank down 20k and the receivable up 20k.
   */
  byAccount: Record<string, number>;
  /**
   * Grand total across every account — the sum of `byAccount`. Transfers cancel
   * across the two legs, so this reduces to Σ initialBalance + income − expense.
   * (Deleting an account cascades to every transaction naming it on either leg,
   * so no half-transfer can survive to unbalance the sum.)
   */
  total: number;
}

/**
 * Every account's balance as of an instant (`asOf`, exclusive), plus the grand
 * total — each account's initial balance, then income in, expense out, and both
 * transfer legs applied for transactions dated before `asOf`. With no `asOf`
 * it's the present state, and `byAccount` then matches `computeAllBalances`.
 *
 * These are the anchors the Transactions page walks back from to show each day's
 * per-account end-of-day balance, and they stay correct for a past month (where
 * the present balances would be the wrong anchor).
 */
export async function balancesAsOf(userId: string, asOf?: Date): Promise<LedgerSnapshot> {
  const user = new Types.ObjectId(userId);
  const accounts = await Account.find({ user }).select("initialBalance").lean();
  const byAccount: Record<string, number> = {};
  for (const a of accounts) byAccount[String(a._id)] = a.initialBalance ?? 0;

  const dateMatch = asOf ? { date: { $lt: asOf } } : {};

  // Money leaving or landing in the account named by `account`. Soft-deleted rows
  // are excluded automatically by the aggregate pre-hook.
  const fromAgg = await Transaction.aggregate<{
    _id: { account: Types.ObjectId; type: string };
    total: number;
  }>([
    { $match: { user, ...dateMatch } },
    { $group: { _id: { account: "$account", type: "$type" }, total: { $sum: "$amount" } } },
  ]);

  for (const row of fromAgg) {
    const key = String(row._id.account);
    if (!(key in byAccount)) continue;
    // An expense and a transfer's outgoing leg both leave the account.
    if (row._id.type === "income") byAccount[key] += row.total;
    else byAccount[key] -= row.total;
  }

  // Transfers IN, grouped by destination account.
  const toAgg = await Transaction.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { user, type: "transfer", toAccount: { $ne: null }, ...dateMatch } },
    { $group: { _id: "$toAccount", total: { $sum: "$amount" } } },
  ]);

  for (const row of toAgg) {
    const key = String(row._id);
    if (key in byAccount) byAccount[key] += row.total;
  }

  const total = Object.values(byAccount).reduce((sum, n) => sum + n, 0);
  return { byAccount, total };
}

/** Total net worth across accounts that are flagged includeInTotal. */
export async function computeNetWorth(userId: string): Promise<{ netWorth: number; byCurrency: Record<string, number> }> {
  const accounts = await Account.find({ user: new Types.ObjectId(userId), includeInTotal: true, archived: false }).lean();
  const balances = await computeAllBalances(userId);
  const byCurrency: Record<string, number> = {};
  let netWorth = 0;
  for (const a of accounts) {
    const bal = balances.get(String(a._id))?.balance ?? 0;
    netWorth += bal;
    const cur = a.currency ?? "INR";
    byCurrency[cur] = (byCurrency[cur] ?? 0) + bal;
  }
  return { netWorth, byCurrency };
}
