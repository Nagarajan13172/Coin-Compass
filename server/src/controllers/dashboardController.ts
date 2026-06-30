import type { Request, Response } from "express";
import { Account } from "../models/Account";
import { Budget } from "../models/Budget";
import { Transaction } from "../models/Transaction";
import { computeAllBalances } from "../services/balanceService";
import { getSummary, getByCategory, getTrend, getSpentForCategory } from "../services/reportService";
import { resolvePeriod, type Period } from "../utils/dateRange";

/** One aggregated payload powering the dashboard overview screen. */
export async function getDashboard(req: Request, res: Response) {
  const period = (String(req.query.period ?? "month") as Period) || "month";
  const { start, end } = resolvePeriod(period);

  const [summary, accountsRaw, balances, byCategory, trend, recent, budgets] = await Promise.all([
    getSummary({ start, end }),
    Account.find({ archived: false }).sort({ order: 1, createdAt: 1 }).lean(),
    computeAllBalances(),
    getByCategory({ start, end, type: "expense" }),
    getTrend({ start, end, granularity: period === "year" ? "month" : "day" }),
    Transaction.find()
      .sort({ date: -1, createdAt: -1 })
      .limit(8)
      .populate("account", "name color icon")
      .populate("toAccount", "name color icon")
      .populate("category", "name color icon type")
      .lean(),
    Budget.find().populate("category", "name color icon").lean(),
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
      const spent = await getSpentForCategory(b.category ? String(b.category) : null, pr.start, pr.end);
      return {
        ...b,
        spent,
        percent: b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0,
        over: spent > b.amount,
      };
    })
  );

  res.json({
    period,
    range: { start, end },
    summary,
    accounts,
    byCategory: byCategory.slice(0, 6),
    trend,
    recent,
    budgets: budgetProgress,
  });
}
