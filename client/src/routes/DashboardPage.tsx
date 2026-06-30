import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowDownLeft, ArrowUpRight, Plus, Receipt, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import { CountUp } from "@/components/common/CountUp";
import { Money } from "@/components/common/Money";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { EmptyState } from "@/components/common/EmptyState";
import { TransactionRow } from "@/features/transactions/TransactionRow";
import { CategoryDonut } from "@/features/reports/CategoryDonut";
import { TrendArea } from "@/features/reports/TrendArea";
import { useDashboard } from "@/hooks/useReports";
import { useUIStore } from "@/stores/ui";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import type { PeriodKey } from "@/lib/types";

export default function DashboardPage() {
  const period = useUIStore((s) => s.period);
  const setPeriod = useUIStore((s) => s.setPeriod);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const { data, isLoading } = useDashboard(period);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Your money at a glance"
        actions={
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <TabsList className="h-9">
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-5">
          {/* hero + summary */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="surface-gradient lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net worth
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CountUp
                  value={data.summary.netWorth}
                  className="tnum block text-3xl font-extrabold tracking-tight"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Across {data.accounts.length} account{data.accounts.length === 1 ? "" : "s"}
                </p>
              </CardContent>
            </Card>

            <StatCard
              icon={<ArrowDownLeft className="h-5 w-5" />}
              label="Income"
              value={data.summary.income}
              tone="income"
            />
            <StatCard
              icon={<ArrowUpRight className="h-5 w-5" />}
              label="Expense"
              value={data.summary.expense}
              tone="expense"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Cash flow</CardTitle>
                <div className="flex items-center gap-4 text-xs">
                  <Legend color="hsl(var(--income))" label="Income" />
                  <Legend color="hsl(var(--expense))" label="Expense" />
                </div>
              </CardHeader>
              <CardContent>
                {data.trend.length ? (
                  <TrendArea data={data.trend} />
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* accounts */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Accounts</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/accounts">View all</Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {data.accounts.slice(0, 5).map((a) => {
                  const Icon = getIcon(a.icon);
                  return (
                    <div key={a._id} className="flex items-center gap-3 py-1.5">
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${a.color}1f`, color: a.color }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 truncate text-sm font-medium">{a.name}</span>
                      <span className="tnum text-sm font-semibold">
                        {formatMoney(a.balance ?? 0, { currency: a.currency })}
                      </span>
                    </div>
                  );
                })}
                {!data.accounts.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No accounts yet</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* spending donut */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Spending by category</CardTitle>
              </CardHeader>
              <CardContent>
                {data.byCategory.length ? (
                  <CategoryDonut
                    data={data.byCategory}
                    total={data.summary.expense}
                  />
                ) : (
                  <EmptyState
                    icon={Receipt}
                    title="No spending yet"
                    description="Add an expense to see your category breakdown."
                  />
                )}
              </CardContent>
            </Card>

            {/* recent */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recent</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/transactions">View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.recent.length ? (
                  <div className="space-y-0.5">
                    {data.recent.slice(0, 6).map((t) => (
                      <TransactionRow key={t._id} txn={t} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Wallet}
                    title="No transactions"
                    description="Start by adding your first transaction."
                    action={
                      <Button onClick={() => openTxnSheet({ type: "expense" })}>
                        <Plus /> Add transaction
                      </Button>
                    }
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* budgets */}
          {data.budgets.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Budgets</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/budgets">Manage</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {data.budgets.map((b) => (
                  <div key={b._id} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <CategoryIcon
                        icon={b.category?.icon}
                        color={b.category?.color}
                        size="sm"
                      />
                      <span className="flex-1 truncate text-sm font-medium">
                        {b.category?.name ?? "Overall"}
                      </span>
                      {b.over && <span className="text-xs font-medium text-expense">Over</span>}
                    </div>
                    <Progress
                      value={Math.min(b.percent, 100)}
                      indicatorClassName={
                        b.over ? "bg-expense" : b.percent > 80 ? "bg-amber-500" : "bg-income"
                      }
                    />
                    <div className="flex justify-between text-xs text-muted-foreground tnum">
                      <span>{formatMoney(b.spent)}</span>
                      <span>{formatMoney(b.amount)}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "income" | "expense";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl ${
            tone === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
          }`}
        >
          {icon}
        </span>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <Money amount={value} className={`text-xl ${tone === "income" ? "text-income" : "text-expense"}`} />
        </div>
      </CardContent>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      No data for this period
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
