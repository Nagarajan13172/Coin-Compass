import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { computeNetWorth } from "./balanceService";

interface RangeArgs {
  start: Date;
  end: Date;
}

/** Income / expense / net for a date range, plus current net worth. */
export async function getSummary(userId: string, { start, end }: RangeArgs) {
  const user = new Types.ObjectId(userId);
  const agg = await Transaction.aggregate<{ _id: string; total: number; count: number }>([
    { $match: { user, date: { $gte: start, $lt: end }, type: { $in: ["income", "expense"] } } },
    { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  ]);

  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  for (const row of agg) {
    if (row._id === "income") {
      income = row.total;
      incomeCount = row.count;
    } else if (row._id === "expense") {
      expense = row.total;
      expenseCount = row.count;
    }
  }

  const { netWorth, byCurrency } = await computeNetWorth(userId);

  return {
    income,
    expense,
    net: income - expense,
    incomeCount,
    expenseCount,
    netWorth,
    byCurrency,
    range: { start, end },
  };
}

/** Spending (or income) grouped by category, for a donut chart. */
export async function getByCategory(
  userId: string,
  { start, end, type = "expense" }: RangeArgs & { type?: "income" | "expense" }
) {
  const user = new Types.ObjectId(userId);
  const rows = await Transaction.aggregate([
    { $match: { user, date: { $gte: start, $lt: end }, type } },
    { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
    { $sort: { total: -1 } },
    {
      $lookup: {
        from: "categories",
        localField: "_id",
        foreignField: "_id",
        as: "category",
      },
    },
    { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: "$_id",
        name: { $ifNull: ["$category.name", "Uncategorized"] },
        color: { $ifNull: ["$category.color", "#94A3B8"] },
        icon: { $ifNull: ["$category.icon", "tag"] },
        total: 1,
        count: 1,
      },
    },
  ]);

  const grandTotal = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({
    ...r,
    percent: grandTotal > 0 ? Math.round((r.total / grandTotal) * 1000) / 10 : 0,
  }));
}

/** Income vs expense bucketed over time (day/week/month) for a trend chart. */
export async function getTrend(
  userId: string,
  { start, end, granularity = "day" }: RangeArgs & { granularity?: "day" | "week" | "month" }
) {
  const user = new Types.ObjectId(userId);
  const format =
    granularity === "month" ? "%Y-%m" : granularity === "week" ? "%G-W%V" : "%Y-%m-%d";

  const rows = await Transaction.aggregate<{
    _id: { bucket: string; type: string };
    total: number;
  }>([
    { $match: { user, date: { $gte: start, $lt: end }, type: { $in: ["income", "expense"] } } },
    {
      $group: {
        _id: {
          bucket: { $dateToString: { format, date: "$date" } },
          type: "$type",
        },
        total: { $sum: "$amount" },
      },
    },
    { $sort: { "_id.bucket": 1 } },
  ]);

  const buckets = new Map<string, { bucket: string; income: number; expense: number }>();
  for (const row of rows) {
    const b = row._id.bucket;
    if (!buckets.has(b)) buckets.set(b, { bucket: b, income: 0, expense: 0 });
    const entry = buckets.get(b)!;
    if (row._id.type === "income") entry.income += row.total;
    else entry.expense += row.total;
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.bucket.localeCompare(b.bucket))
    .map((b) => ({ ...b, net: b.income - b.expense }));
}

/** Per-account income/expense totals for a date range. */
export async function getByAccount(userId: string, { start, end }: RangeArgs) {
  const user = new Types.ObjectId(userId);
  const rows = await Transaction.aggregate([
    { $match: { user, date: { $gte: start, $lt: end } } },
    { $group: { _id: { account: "$account", type: "$type" }, total: { $sum: "$amount" } } },
    {
      $lookup: {
        from: "accounts",
        localField: "_id.account",
        foreignField: "_id",
        as: "account",
      },
    },
    { $unwind: "$account" },
    {
      $group: {
        _id: "$_id.account",
        name: { $first: "$account.name" },
        color: { $first: "$account.color" },
        income: { $sum: { $cond: [{ $eq: ["$_id.type", "income"] }, "$total", 0] } },
        expense: { $sum: { $cond: [{ $eq: ["$_id.type", "expense"] }, "$total", 0] } },
      },
    },
    { $sort: { expense: -1 } },
  ]);
  return rows;
}

/** Spent amount for a category within a range (used by budget progress). */
export async function getSpentForCategory(
  userId: string,
  categoryId: string | null,
  start: Date,
  end: Date
): Promise<number> {
  const match: Record<string, unknown> = {
    user: new Types.ObjectId(userId),
    date: { $gte: start, $lt: end },
    type: "expense",
  };
  if (categoryId) match.category = new Types.ObjectId(categoryId);

  const agg = await Transaction.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return agg[0]?.total ?? 0;
}
