import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { getByCategory } from "./reportService";
import { resolvePeriod, startOfDay, addDays, type Period } from "../utils/dateRange";

const DAY = 86_400_000;

/** A single figure compared against the same figure in the previous period. */
export interface InsightsMetric {
  current: number;
  previous: number;
  delta: number; // current − previous
  pct: number | null; // % change vs previous; null when previous is 0 (no baseline)
}

export interface CategoryMover {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  current: number;
  previous: number;
  delta: number;
  pct: number | null;
}

export interface TopExpense {
  _id: string;
  amount: number;
  note: string;
  payee: string;
  date: string;
  category: { name: string; color: string; icon: string } | null;
  account: { name: string; color: string } | null;
}

export interface InsightsPace {
  /** Whether the selected period is the one we're currently living through. */
  isCurrent: boolean;
  daysElapsed: number;
  daysInPeriod: number;
  avgPerDay: number;
  /** Spend extrapolated to the whole period at the current daily rate. */
  projected: number;
  /** Previous period's spend up to the SAME day-of-period — a fair pace comparison. */
  previousToDate: number;
}

export interface InsightsReport {
  period: Period;
  current: { start: string; end: string };
  previous: { start: string; end: string };
  expense: InsightsMetric;
  income: InsightsMetric;
  net: InsightsMetric;
  savingsRate: { current: number | null; previous: number | null };
  pace: InsightsPace;
  movers: CategoryMover[];
  topExpenses: TopExpense[];
  hasData: boolean;
}

function metric(current: number, previous: number): InsightsMetric {
  const delta = current - previous;
  const pct = previous > 0 ? Math.round((delta / previous) * 1000) / 10 : null;
  return { current, previous, delta, pct };
}

/** Income + expense totals for a range (leaner than getSummary — no net-worth work). */
async function incomeExpense(user: Types.ObjectId, start: Date, end: Date) {
  const agg = await Transaction.aggregate<{ _id: string; total: number }>([
    { $match: { user, date: { $gte: start, $lt: end }, type: { $in: ["income", "expense"] } } },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
  let income = 0;
  let expense = 0;
  for (const r of agg) {
    if (r._id === "income") income = r.total;
    else expense = r.total;
  }
  return { income, expense };
}

async function expenseUpTo(user: Types.ObjectId, start: Date, end: Date) {
  const agg = await Transaction.aggregate<{ total: number }>([
    { $match: { user, date: { $gte: start, $lt: end }, type: "expense" } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return agg[0]?.total ?? 0;
}

/** Merge current + previous per-category expense into signed "movers". */
function buildMovers(
  current: Awaited<ReturnType<typeof getByCategory>>,
  previous: Awaited<ReturnType<typeof getByCategory>>,
  limit = 8
): CategoryMover[] {
  const key = (id: unknown) => (id ? String(id) : "__uncat__");
  const byKey = new Map<string, CategoryMover>();

  const seed = (
    row: (typeof current)[number],
    field: "current" | "previous"
  ) => {
    const k = key(row.categoryId);
    const existing =
      byKey.get(k) ??
      ({
        categoryId: row.categoryId ? String(row.categoryId) : null,
        name: row.name,
        color: row.color,
        icon: row.icon,
        current: 0,
        previous: 0,
        delta: 0,
        pct: null,
      } as CategoryMover);
    existing[field] = row.total;
    byKey.set(k, existing);
  };

  for (const r of current) seed(r, "current");
  for (const r of previous) seed(r, "previous");

  return [...byKey.values()]
    .map((m) => {
      const delta = m.current - m.previous;
      const pct = m.previous > 0 ? Math.round((delta / m.previous) * 1000) / 10 : null;
      return { ...m, delta, pct };
    })
    .filter((m) => Math.abs(m.delta) > 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, limit);
}

async function getTopExpenses(user: Types.ObjectId, start: Date, end: Date): Promise<TopExpense[]> {
  const rows = await Transaction.find({ user, type: "expense", date: { $gte: start, $lt: end } })
    .sort({ amount: -1, date: -1 })
    .limit(5)
    .populate("category", "name color icon")
    .populate("account", "name color")
    .lean();

  return rows.map((r: any) => ({
    _id: String(r._id),
    amount: r.amount,
    note: r.note ?? "",
    payee: r.payee ?? "",
    date: new Date(r.date).toISOString(),
    category: r.category
      ? { name: r.category.name, color: r.category.color, icon: r.category.icon }
      : null,
    account: r.account ? { name: r.account.name, color: r.account.color } : null,
  }));
}

/** Everything the Insights page needs: period-over-period comparison, category
 *  movers, spending pace, and the biggest single expenses. */
export async function computeInsights(userId: string, period: Period, ref: Date): Promise<InsightsReport> {
  const user = new Types.ObjectId(userId);
  const current = resolvePeriod(period, ref);
  // The day before the current period starts always lands squarely in the
  // previous one — robust across week/month/year and month-length differences.
  const previous = resolvePeriod(period, addDays(current.start, -1));

  const daysInPeriod = Math.max(1, Math.round((current.end.getTime() - current.start.getTime()) / DAY));
  const now = new Date();
  const isCurrent = now >= current.start && now < current.end;
  const daysElapsed = isCurrent
    ? Math.min(daysInPeriod, Math.max(1, Math.floor((startOfDay(now).getTime() - current.start.getTime()) / DAY) + 1))
    : daysInPeriod;

  // Previous period's spend up to the same day-of-period (clamped to its end, since
  // the previous month/period may be shorter than the current one).
  const prevCutoff = new Date(Math.min(addDays(previous.start, daysElapsed).getTime(), previous.end.getTime()));

  const [curTotals, prevTotals, curCats, prevCats, topExpenses, previousToDate] = await Promise.all([
    incomeExpense(user, current.start, current.end),
    incomeExpense(user, previous.start, previous.end),
    getByCategory(userId, { start: current.start, end: current.end, type: "expense" }),
    getByCategory(userId, { start: previous.start, end: previous.end, type: "expense" }),
    getTopExpenses(user, current.start, current.end),
    expenseUpTo(user, previous.start, prevCutoff),
  ]);

  const expense = metric(curTotals.expense, prevTotals.expense);
  const income = metric(curTotals.income, prevTotals.income);
  const net = metric(curTotals.income - curTotals.expense, prevTotals.income - prevTotals.expense);

  const savingsRate = {
    current: curTotals.income > 0 ? Math.round(((curTotals.income - curTotals.expense) / curTotals.income) * 100) : null,
    previous: prevTotals.income > 0 ? Math.round(((prevTotals.income - prevTotals.expense) / prevTotals.income) * 100) : null,
  };

  const avgPerDay = curTotals.expense / daysElapsed;
  const pace: InsightsPace = {
    isCurrent,
    daysElapsed,
    daysInPeriod,
    avgPerDay,
    projected: isCurrent ? Math.round(avgPerDay * daysInPeriod) : curTotals.expense,
    previousToDate,
  };

  return {
    period,
    current: { start: current.start.toISOString(), end: current.end.toISOString() },
    previous: { start: previous.start.toISOString(), end: previous.end.toISOString() },
    expense,
    income,
    net,
    savingsRate,
    pace,
    movers: buildMovers(curCats, prevCats),
    topExpenses,
    hasData: curTotals.expense > 0 || curTotals.income > 0 || prevTotals.expense > 0 || prevTotals.income > 0,
  };
}
