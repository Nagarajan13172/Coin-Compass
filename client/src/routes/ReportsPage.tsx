import { useMemo, useState } from "react";
import { differenceInCalendarDays } from "date-fns";
import { Download, Lightbulb, PieChart as PieIcon, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PeriodSwitcher } from "@/components/common/PeriodSwitcher";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Money } from "@/components/common/Money";
import { CategoryDonut } from "@/features/reports/CategoryDonut";
import { TrendArea } from "@/features/reports/TrendArea";
import { IncomeExpenseBar } from "@/features/reports/IncomeExpenseBar";
import { useByCategory, useSummary, useTrend } from "@/hooks/useReports";
import { periodRange, shiftPeriod } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { PeriodKey } from "@/lib/types";

const PERIOD_NOUN: Record<PeriodKey, string> = { week: "week", month: "month", year: "year" };

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [refDate, setRefDate] = useState(new Date());
  const [donutType, setDonutType] = useState<"expense" | "income">("expense");

  const range = useMemo(() => {
    const { start, end } = periodRange(period, refDate);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [period, refDate]);

  const granularity = period === "year" ? "month" : "day";

  // Previous period, for "vs last month" comparisons.
  const prevRange = useMemo(() => {
    const { start, end } = periodRange(period, shiftPeriod(period, refDate, -1));
    return { from: start.toISOString(), to: end.toISOString() };
  }, [period, refDate]);

  const summary = useSummary(range);
  const prevSummary = useSummary(prevRange);
  const byCategory = useByCategory({ ...range, type: donutType });
  const expenseCats = useByCategory({ ...range, type: "expense" });
  const trend = useTrend({ ...range, granularity });

  const total = donutType === "expense" ? summary.data?.expense ?? 0 : summary.data?.income ?? 0;

  const insights = useMemo(() => {
    const expense = summary.data?.expense ?? 0;
    const income = summary.data?.income ?? 0;
    const net = summary.data?.net ?? 0;
    const prevExpense = prevSummary.data?.expense ?? 0;

    // Average daily spend over days elapsed in the period (so the current,
    // partial month isn't divided by a full 30 days).
    const start = new Date(range.from);
    const end = new Date(range.to);
    const now = new Date();
    const lastDay = now < end ? now : end;
    const days = Math.max(1, differenceInCalendarDays(lastDay, start) + 1);

    return {
      expense,
      income,
      avgDaily: expense / days,
      savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
      top: [...(expenseCats.data ?? [])].sort((a, b) => b.total - a.total)[0] ?? null,
      momPct: prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null,
    };
  }, [summary.data, prevSummary.data, expenseCats.data, range]);

  const periodNoun = PERIOD_NOUN[period];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Analyse your income and spending"
        actions={
          <Button variant="outline" asChild>
            <a href={`/api/export/csv?from=${range.from}&to=${range.to}`}>
              <Download /> Export CSV
            </a>
          </Button>
        }
      />

      <PeriodSwitcher
        period={period}
        onPeriodChange={setPeriod}
        refDate={refDate}
        onShift={(dir) => setRefDate((d) => shiftPeriod(period, d, dir))}
        className="mb-5"
      />

      {/* summary */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <SummaryStat label="Income" loading={summary.isLoading}>
          <Money amount={summary.data?.income ?? 0} className="text-2xl text-income" />
        </SummaryStat>
        <SummaryStat label="Expense" loading={summary.isLoading}>
          <Money amount={summary.data?.expense ?? 0} className="text-2xl text-expense" />
        </SummaryStat>
        <SummaryStat label="Net" loading={summary.isLoading}>
          <span
            className={`tnum text-2xl font-semibold ${
              (summary.data?.net ?? 0) >= 0 ? "text-income" : "text-expense"
            }`}
          >
            <Money amount={summary.data?.net ?? 0} />
          </span>
        </SummaryStat>
      </div>

      {/* insights */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryStat label="Avg daily spend" loading={summary.isLoading}>
          <span className="tnum text-2xl font-semibold">{formatMoney(insights.avgDaily)}</span>
        </SummaryStat>
        <SummaryStat label="Savings rate" loading={summary.isLoading}>
          {insights.savingsRate == null ? (
            <span className="text-2xl font-semibold text-muted-foreground">—</span>
          ) : (
            <span
              className={`tnum text-2xl font-semibold ${insights.savingsRate >= 0 ? "text-income" : "text-expense"}`}
            >
              {insights.savingsRate}%
            </span>
          )}
        </SummaryStat>
        <SummaryStat label="Biggest expense" loading={summary.isLoading || expenseCats.isLoading}>
          {insights.top ? (
            <div>
              <p className="truncate text-lg font-semibold">{insights.top.name}</p>
              <p className="tnum text-xs text-muted-foreground">
                {formatMoney(insights.top.total)} · {insights.top.percent}%
              </p>
            </div>
          ) : (
            <span className="text-2xl font-semibold text-muted-foreground">—</span>
          )}
        </SummaryStat>
        <SummaryStat label={`Spending vs last ${periodNoun}`} loading={summary.isLoading || prevSummary.isLoading}>
          {insights.momPct == null ? (
            <span className="text-2xl font-semibold text-muted-foreground">—</span>
          ) : (
            <span
              className={`flex items-center gap-1 text-2xl font-semibold ${insights.momPct > 0 ? "text-expense" : "text-income"}`}
            >
              {insights.momPct > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {insights.momPct > 0 ? "+" : ""}
              {insights.momPct}%
            </span>
          )}
        </SummaryStat>
      </div>

      {insights.top && !summary.isLoading && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border bg-muted/30 p-4 text-sm">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p>
            This {periodNoun} your biggest expense is{" "}
            <span className="font-semibold">{insights.top.name}</span> ({formatMoney(insights.top.total)},{" "}
            {insights.top.percent}% of spending)
            {insights.momPct != null && (
              <>
                . Overall spending is{" "}
                <span className={insights.momPct > 0 ? "font-semibold text-expense" : "font-semibold text-income"}>
                  {Math.abs(insights.momPct)}%{" "}
                  {insights.momPct > 0 ? "higher" : insights.momPct < 0 ? "lower" : "the same"}
                </span>{" "}
                than last {periodNoun}
              </>
            )}
            .
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>By category</CardTitle>
            <Tabs value={donutType} onValueChange={(v) => setDonutType(v as "expense" | "income")}>
              <TabsList className="h-8">
                <TabsTrigger value="expense" className="text-xs">Expense</TabsTrigger>
                <TabsTrigger value="income" className="text-xs">Income</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {byCategory.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : byCategory.data?.length ? (
              <CategoryDonut data={byCategory.data} total={total} />
            ) : (
              <EmptyState icon={PieIcon} title="No data" description="No transactions in this period." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Income vs Expense</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : trend.data?.length ? (
              <IncomeExpenseBar data={trend.data} />
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {trend.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : trend.data?.length ? (
              <TrendArea data={trend.data} />
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  loading,
  children,
}: {
  label: string;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-7 w-28" /> : <div className="mt-1">{children}</div>}
      </CardContent>
    </Card>
  );
}
