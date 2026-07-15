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

/**
 * Total balance across ALL of a user's accounts as of an instant (exclusive):
 * every account's initial balance plus income minus expense for transactions
 * dated before `asOf`. Transfers move money between two of the user's own
 * accounts, so they cancel in the whole-portfolio total and are ignored — which
 * makes this consistent with the sum of `computeAllBalances` (whose transferIn /
 * transferOut totals also cancel). With no `asOf` it's the current grand total.
 *
 * This is the anchor the Transactions page walks back from to show each day's
 * end-of-day balance, and it stays correct for a past month (where the present
 * account balances would be the wrong anchor).
 */
export async function balanceAsOf(userId: string, asOf?: Date): Promise<number> {
  const user = new Types.ObjectId(userId);
  const accounts = await Account.find({ user }).select("initialBalance").lean();
  const initial = accounts.reduce((sum, a) => sum + (a.initialBalance ?? 0), 0);

  const match: Record<string, unknown> = { user, type: { $in: ["income", "expense"] } };
  if (asOf) match.date = { $lt: asOf };

  // Soft-deleted rows are excluded automatically by the aggregate pre-hook.
  const agg = await Transaction.aggregate<{ _id: "income" | "expense"; total: number }>([
    { $match: match },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);

  let income = 0;
  let expense = 0;
  for (const row of agg) {
    if (row._id === "income") income = row.total;
    else if (row._id === "expense") expense = row.total;
  }
  return initial + income - expense;
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
