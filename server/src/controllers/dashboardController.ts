import type { Request, Response } from "express";
import { Account } from "../models/Account";
import { Budget } from "../models/Budget";
import { Transaction } from "../models/Transaction";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { computeAllBalances } from "../services/balanceService";
import { categoryIdOf } from "./budgetController";
import { getSummary, getByCategory, getTrend, getSpentForCategory } from "../services/reportService";
import { resolvePeriod, addDays, startOfDay, type Period } from "../utils/dateRange";
import { userId, canSeeWealth } from "../middleware/auth";

/** How far ahead (days) a recurring rule counts as "due soon" on the dashboard. */
const DUE_SOON_DAYS = 7;

/** One aggregated payload powering the dashboard overview screen. */
export async function getDashboard(req: Request, res: Response) {
  const uid = userId(req);
  const period = (String(req.query.period ?? "month") as Period) || "month";
  const { start, end } = resolvePeriod(period);
  const dueSoonBefore = addDays(new Date(), DUE_SOON_DAYS);

  const [summary, accountsRaw, balances, byCategory, trend, recent, budgets, upcoming] =
    await Promise.all([
      getSummary(uid, { start, end }),
      Account.find({ user: uid, archived: false }).sort({ order: 1, createdAt: 1 }).lean(),
      computeAllBalances(uid),
      getByCategory(uid, { start, end, type: "expense" }),
      getTrend(uid, { start, end, granularity: period === "year" ? "month" : "day" }),
      Transaction.find({ user: uid })
        .sort({ date: -1, createdAt: -1 })
        .limit(8)
        .populate("account", "name color icon")
        .populate("toAccount", "name color icon")
        .populate("category", "name color icon type")
        .lean(),
      Budget.find({ user: uid }).populate("category", "name color icon").lean(),
      RecurringTransaction.find({
        user: uid,
        active: true,
        nextRun: { $lte: dueSoonBefore },
        // Exclude rules whose end date has already passed but haven't been
        // deactivated by the cron yet — they can't post anything.
        $or: [{ endDate: null }, { endDate: { $gte: startOfDay(new Date()) } }],
      })
        .sort({ nextRun: 1 })
        .limit(6)
        .populate("account", "name color icon currency")
        .populate("toAccount", "name color icon currency")
        .populate("category", "name color icon type")
        .lean(),
    ]);

  const accounts = accountsRaw.map((a) => ({
    ...a,
    balance: balances.get(String(a._id))?.balance ?? a.initialBalance ?? 0,
  }));

  // top budgets with progress (current period for each budget)
  const budgetProgress = await Promise.all(
    budgets.slice(0, 5).map(async (b) => {
      const pr = resolvePeriod(
        b.period === "weekly" ? "week" : b.period === "yearly" ? "year" : "month"
      );
      const spent = await getSpentForCategory(uid, categoryIdOf(b.category), pr.start, pr.end);
      return {
        ...b,
        spent,
        percent: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
        over: spent > b.amount,
      };
    })
  );

  // Hide the net-worth figure entirely in the everyday (user) view.
  const showWealth = await canSeeWealth(req);

  res.json({
    period,
    range: { start, end },
    summary: showWealth ? summary : { ...summary, netWorth: 0, byCurrency: {} },
    accounts,
    byCategory: byCategory.slice(0, 6),
    trend,
    recent,
    budgets: budgetProgress,
    upcoming,
  });
}
