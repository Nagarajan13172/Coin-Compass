import { useMemo, useState } from "react";
import { Download, PieChart as PieIcon } from "lucide-react";
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
import type { PeriodKey } from "@/lib/types";

export default function ReportsPage() {
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [refDate, setRefDate] = useState(new Date());
  const [donutType, setDonutType] = useState<"expense" | "income">("expense");

  const range = useMemo(() => {
    const { start, end } = periodRange(period, refDate);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [period, refDate]);

  const granularity = period === "year" ? "month" : "day";

  const summary = useSummary(range);
  const byCategory = useByCategory({ ...range, type: donutType });
  const trend = useTrend({ ...range, granularity });

  const total = donutType === "expense" ? summary.data?.expense ?? 0 : summary.data?.income ?? 0;

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
