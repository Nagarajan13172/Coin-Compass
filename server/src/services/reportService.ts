import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { computeNetWorth } from "./balanceService";

interface RangeArgs {
  start: Date;
  end: Date;
}

/**
 * Category groups whose outflow is NOT consumption: money moved into savings, and
 * loan principal repaid. Both leave the current account but neither makes you
 * poorer — a deposit is still yours, and repaying principal converts debt into
 * equity. Counting them as spending is what made the savings-rate metric report
 * ~13% for a month that was really closer to 30%.
 *
 * Keep in sync with GROUP_META in client/src/lib/categoryGroups.ts.
 */
export const NON_CONSUMPTION_GROUPS = ["savings", "debt_transfers"];

/** Ids of this user's categories whose spend is not consumption. */
async function nonConsumptionCategoryIds(user: Types.ObjectId): Promise<Types.ObjectId[]> {
  const rows = await Category.find({ user, group: { $in: NON_CONSUMPTION_GROUPS } })
    .select("_id")
    .lean();
  return rows.map((r) => r._id as Types.ObjectId);
}

/** Income / expense / net for a date range, plus current net worth. */
export async function getSummary(userId: string, { start, end }: RangeArgs) {
  const user = new Types.ObjectId(userId);
  const agg = await Transaction.aggregate<{
    _id: string;
    total: number;
    count: number;
    oneoff: number;
  }>([
    { $match: { user, date: { $gte: start, $lt: end }, type: { $in: ["income", "expense"] } } },
    {
      $group: {
        _id: "$type",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
        // Portion of the total that's flagged irregular / one-off.
        oneoff: { $sum: { $cond: [{ $eq: ["$oneoff", true] }, "$amount", 0] } },
      },
    },
  ]);

  let income = 0;
  let expense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let oneoffIncome = 0;
  let oneoffExpense = 0;
  for (const row of agg) {
    if (row._id === "income") {
      income = row.total;
      incomeCount = row.count;
      oneoffIncome = row.oneoff;
    } else if (row._id === "expense") {
      expense = row.total;
      expenseCount = row.count;
      oneoffExpense = row.oneoff;
    }
  }

  // Split the expense total into what you actually consumed vs what merely moved
  // (savings deposits, loan principal). Computed here so the dashboard, the
  // transactions rail and the insights endpoint all share one definition instead
  // of each deriving its own savings rate from the raw expense figure.
  const excluded = await nonConsumptionCategoryIds(user);
  let nonConsumption = 0;
  if (excluded.length) {
    const rows = await Transaction.aggregate<{ total: number }>([
      {
        $match: {
          user,
          date: { $gte: start, $lt: end },
          type: "expense",
          category: { $in: excluded },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    nonConsumption = rows[0]?.total ?? 0;
  }
  const consumption = expense - nonConsumption;

  const { netWorth, byCurrency } = await computeNetWorth(userId);

  return {
    income,
    expense,
    net: income - expense,
    incomeCount,
    expenseCount,
    oneoffIncome,
    oneoffExpense,
    /** Expense minus savings deposits and debt principal — the true cost of living. */
    consumption,
    /** The part of `expense` that stayed yours: deposits + principal repaid. */
    nonConsumption,
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
        // Rollup bucket for the grouped donut view; null for ungrouped and for
        // uncategorized rows. Rows stay at leaf granularity — the client folds
        // them, so every existing consumer of this shape is unaffected.
        group: { $ifNull: ["$category.group", null] },
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
  const range = { $gte: start, $lt: end };

  // A transfer is money genuinely entering or leaving an account, so a per-account
  // view has to count it — unlike the portfolio totals in getSummary, where the two
  // legs cancel. It needs BOTH legs: `account` is the source, `toAccount` the
  // destination. Grouping only by `account` (as this used to) meant an account whose
  // activity is entirely transfers — a receivable like "Money Lent" — rendered as a
  // row of zeroes, and every other account's in/out silently omitted its transfers.
  // Same two-pass shape as computeAllBalances in balanceService.
  const [outgoing, incoming, accounts] = await Promise.all([
    Transaction.aggregate<{ _id: { account: Types.ObjectId; type: string }; total: number }>([
      { $match: { user, date: range } },
      { $group: { _id: { account: "$account", type: "$type" }, total: { $sum: "$amount" } } },
    ]),
    Transaction.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { user, date: range, type: "transfer", toAccount: { $ne: null } } },
      { $group: { _id: "$toAccount", total: { $sum: "$amount" } } },
    ]),
    Account.find({ user }).select("name color").lean(),
  ]);

  const byId = new Map(accounts.map((a) => [String(a._id), a]));
  const rows = new Map<
    string,
    { _id: string; name: string; color?: string; income: number; expense: number; transferIn: number; transferOut: number }
  >();
  const row = (id: string) => {
    let r = rows.get(id);
    if (!r) {
      const acc = byId.get(id);
      // Skip movement on an account that no longer exists rather than inventing a row.
      if (!acc) return null;
      r = { _id: id, name: acc.name, color: acc.color, income: 0, expense: 0, transferIn: 0, transferOut: 0 };
      rows.set(id, r);
    }
    return r;
  };

  for (const o of outgoing) {
    const r = row(String(o._id.account));
    if (!r) continue;
    if (o._id.type === "income") r.income += o.total;
    else if (o._id.type === "expense") r.expense += o.total;
    else if (o._id.type === "transfer") r.transferOut += o.total;
  }
  for (const i of incoming) {
    const r = row(String(i._id));
    if (r) r.transferIn += i.total;
  }

  // Busiest account first, measured on everything that left it.
  return [...rows.values()].sort((a, b) => b.expense + b.transferOut - (a.expense + a.transferOut));
}

/** Spent amount for a category within a range (used by budget progress). */
export async function getSpentForCategory(
  userId: string,
  categoryId: string | null,
  start: Date,
  end: Date
): Promise<number> {
  const user = new Types.ObjectId(userId);
  const match: Record<string, unknown> = {
    user,
    date: { $gte: start, $lt: end },
    type: "expense",
  };
  if (categoryId) {
    match.category = new Types.ObjectId(categoryId);
  } else {
    // An OVERALL budget (null category) is a cap on what you consume, so it must
    // not count deposits or loan principal. Including them meant the only way to
    // stay under was to set the cap above your entire outflow, which made the
    // overall budget useless. A budget aimed AT one of those categories still
    // measures it normally — the exclusion is specific to the overall case.
    const excluded = await nonConsumptionCategoryIds(user);
    if (excluded.length) match.category = { $nin: excluded };
  }

  const agg = await Transaction.aggregate<{ total: number }>([
    { $match: match },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return agg[0]?.total ?? 0;
}
