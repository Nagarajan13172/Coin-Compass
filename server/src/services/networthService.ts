import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Holding } from "../models/Holding";
import { Loan } from "../models/Loan";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import { computeAllBalances } from "./balanceService";

/** Today's date as YYYY-MM-DD in IST, so a snapshot lines up with the user's day. */
function istDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export interface NetWorthBreakdown {
  netWorth: number;
  assets: number;
  liabilities: number;
  accountsTotal: number;
  holdingsTotal: number;
  saving: number;
  investment: number;
}

/**
 * Current net worth for a user: account balances (flagged includeInTotal) plus
 * holdings, minus outstanding on active loans. Mirrors the client's live
 * computation so the trend's newest point matches the summary cards exactly.
 */
export async function computeNetWorthBreakdown(userId: string): Promise<NetWorthBreakdown> {
  const user = new Types.ObjectId(userId);
  const [accounts, holdings, loans, balances] = await Promise.all([
    Account.find({ user, includeInTotal: true, archived: false }).lean(),
    Holding.find({ user }).lean(),
    Loan.find({ user, status: "active" }).lean(),
    computeAllBalances(userId),
  ]);

  const accountsTotal = accounts.reduce((s, a) => s + (balances.get(String(a._id))?.balance ?? 0), 0);
  const saving = holdings.filter((h) => h.class === "saving").reduce((s, h) => s + h.value, 0);
  const investment = holdings.filter((h) => h.class === "investment").reduce((s, h) => s + h.value, 0);
  const holdingsTotal = saving + investment;
  const assets = accountsTotal + holdingsTotal;
  const liabilities = loans.reduce((s, l) => s + l.outstanding, 0);

  return { netWorth: assets - liabilities, assets, liabilities, accountsTotal, holdingsTotal, saving, investment };
}

/**
 * Compute today's net worth and upsert it as the snapshot for the current IST
 * day. Idempotent — re-running on the same day overwrites that day's point with
 * the latest figures, so the newest snapshot always reflects current data.
 */
export async function snapshotNetWorth(userId: string): Promise<void> {
  const b = await computeNetWorthBreakdown(userId);
  await NetWorthSnapshot.updateOne(
    { user: new Types.ObjectId(userId), date: istDate() },
    { $set: b },
    { upsert: true }
  );
}

/**
 * Snapshot today, then return the last `days` snapshots oldest → newest. Taking
 * the snapshot on read means the trend self-maintains for active users without a
 * per-user cron; it simply accumulates one point per day the user visits.
 */
export async function getNetWorthHistory(userId: string, days: number) {
  await snapshotNetWorth(userId);
  const rows = await NetWorthSnapshot.find({ user: new Types.ObjectId(userId) })
    .sort({ date: -1 })
    .limit(days)
    .lean();
  return rows.reverse();
}
