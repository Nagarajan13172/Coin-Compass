import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { ChevronRight, Info, Lightbulb, PieChart as PieIcon, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PeriodSwitcher } from "@/components/common/PeriodSwitcher";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Money } from "@/components/common/Money";
import { CategoryDonut } from "@/features/reports/CategoryDonut";
import { NetTrendArea } from "@/features/reports/NetTrendArea";
import { IncomeExpenseBar } from "@/features/reports/IncomeExpenseBar";
import { ByAccountList } from "@/features/reports/ByAccountList";
import { ExportMenu } from "@/features/reports/ExportMenu";
import { useByAccount, useByCategory, useSummary, useTrend } from "@/hooks/useReports";
import { bucketRange, periodRange, shiftPeriod, periodLabel } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PeriodKey } from "@/lib/types";

const PERIOD_NOUN: Record<PeriodKey, string> = { week: "week", month: "month", year: "year" };

export default function ReportsPage() {
  const navigate = useNavigate();
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
  const byAccount = useByAccount(range);

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
      prevExpense,
      days,
      avgDaily: expense / days,
      savingsRate: income > 0 ? Math.round((net / income) * 100) : null,
      top: [...(expenseCats.data ?? [])].sort((a, b) => b.total - a.total)[0] ?? null,
      momPct: prevExpense > 0 ? Math.round(((expense - prevExpense) / prevExpense) * 100) : null,
    };
  }, [summary.data, prevSummary.data, expenseCats.data, range]);

  const periodNoun = PERIOD_NOUN[period];
  const viewLabel = `${periodLabel(period, refDate)} · ${periodNoun[0].toUpperCase()}${periodNoun.slice(1)} view`;

  /** Deep-link into a filtered Transactions list for the current period. */
  function openTxns(params: Record<string, string | undefined>) {
    const sp = new URLSearchParams({ from: range.from, to: range.to });
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    navigate(`/transactions?${sp.toString()}`);
  }

  /** Drill into a single chart bucket (a day or month) worth of transactions. */
  function openBucket(bucket: string) {
    const r = bucketRange(bucket);
    if (r) openTxns({ from: r.from, to: r.to });
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Analyse your income and spending"
        actions={<ExportMenu key={range.from} range={range} periodLabel={periodLabel(period, refDate)} />}
      />

      <PeriodSwitcher
        period={period}
        onPeriodChange={setPeriod}
        refDate={refDate}
        onShift={(dir) => setRefDate((d) => shiftPeriod(period, d, dir))}
        className="mb-2"
      />

      {/* Explicit statement of what the metrics below refer to. */}
      <p className="mb-5 text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{viewLabel}</span>
      </p>

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
        <SummaryStat
          label="Avg daily spend"
          loading={summary.isLoading}
          hint="Total spent ÷ days elapsed in this period, so a partial month isn't divided by a full 30 days."
          sub={`over ${insights.days} day${insights.days === 1 ? "" : "s"}`}
        >
          <span className="tnum text-2xl font-semibold">{formatMoney(insights.avgDaily)}</span>
        </SummaryStat>

        <SummaryStat
          label="Savings rate"
          loading={summary.isLoading}
          hint="Share of income kept after spending: (income − expense) ÷ income × 100."
        >
          {insights.savingsRate == null ? (
            <span className="text-2xl font-semibold text-muted-foreground">—</span>
          ) : (
            <span
              className={`tnum text-2xl font-semibold ${insights.savingsRate >= 0 ? "text-income" : "text-expense"}`}
            >
              {/* Below −100% just means expenses far exceed a tiny income — the exact
                  huge number isn't meaningful, so cap the display. */}
              {insights.savingsRate < -100 ? "< −100%" : `${insights.savingsRate}%`}
            </span>
          )}
        </SummaryStat>

        <SummaryStat
          label="Biggest expense"
          loading={summary.isLoading || expenseCats.isLoading}
          onClick={
            insights.top
              ? () => openTxns({ type: "expense", category: insights.top!.categoryId ?? undefined })
              : undefined
          }
        >
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

        <SummaryStat
          label={`Spending vs last ${periodNoun}`}
          loading={summary.isLoading || prevSummary.isLoading}
          sub={
            insights.prevExpense > 0 ? `Last ${periodNoun}: ${formatMoney(insights.prevExpense)}` : undefined
          }
        >
          {insights.momPct == null ? (
            <span className="text-2xl font-semibold text-muted-foreground">—</span>
          ) : (
            <span
              className={`flex items-center gap-1 text-2xl font-semibold ${insights.momPct > 0 ? "text-expense" : "text-income"}`}
            >
              {insights.momPct > 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {Math.abs(insights.momPct)}% {insights.momPct > 0 ? "higher" : insights.momPct < 0 ? "lower" : "same"}
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
        <Card className="lg:col-span-2">
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
              <CategoryDonut
                data={byCategory.data}
                total={total}
                showBars
                wideLegend
                centerLabel={donutType === "expense" ? "Total spent" : "Total earned"}
                onSelect={(categoryId) => openTxns({ type: donutType, category: categoryId ?? undefined })}
              />
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
              <IncomeExpenseBar data={trend.data} onSelect={openBucket} />
            ) : (
              <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                No data for this period
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>By account</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Money in vs out per account</p>
            </div>
          </CardHeader>
          <CardContent>
            {byAccount.isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : byAccount.data?.length ? (
              <ByAccountList data={byAccount.data} onSelect={(accountId) => openTxns({ account: accountId })} />
            ) : (
              <EmptyState icon={Wallet} title="No data" description="No transactions in this period." />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Net cash flow</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Income minus expense over time</p>
            </div>
          </CardHeader>
          <CardContent>
            {trend.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : trend.data?.length ? (
              <NetTrendArea data={trend.data} onSelect={openBucket} />
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
  hint,
  sub,
  onClick,
  children,
}: {
  label: string;
  loading: boolean;
  hint?: string;
  sub?: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  const header = (
    <div className="flex items-center gap-1.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      {hint && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`About ${label}`} className="text-muted-foreground/70 hover:text-foreground">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[220px] text-xs">{hint}</TooltipContent>
        </Tooltip>
      )}
      {onClick && <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/60" />}
    </div>
  );

  const body = (
    <>
      {header}
      {loading ? (
        <Skeleton className="mt-1 h-7 w-28" />
      ) : (
        <>
          <div className="mt-1">{children}</div>
          {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
        </>
      )}
    </>
  );

  if (onClick) {
    return (
      <Card
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className={cn(
          "cursor-pointer transition-colors hover:border-primary/40 hover:bg-accent/40",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <CardContent className="p-5">{body}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-5">{body}</CardContent>
    </Card>
  );
}
