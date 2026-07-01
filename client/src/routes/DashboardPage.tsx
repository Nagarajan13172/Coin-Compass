import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { format, differenceInCalendarDays } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Info, Landmark, Plus, Receipt, Trophy, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { GoldRateCard } from "@/features/metals/GoldRateCard";
import { useDashboard } from "@/hooks/useReports";
import { useGoals } from "@/hooks/useGoals";
import { PostRecurringDialog } from "@/features/recurring/PostRecurringDialog";
import { useUIStore } from "@/stores/ui";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { formatPeriodRange } from "@/lib/dates";
import { accountTypeLabel } from "@/lib/accounts";
import type { PeriodKey, Recurring } from "@/lib/types";

const PERIOD_NOUN: Record<PeriodKey, string> = {
  week: "This week",
  month: "This month",
  year: "This year",
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const period = useUIStore((s) => s.period);
  const setPeriod = useUIStore((s) => s.setPeriod);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const { data, isLoading } = useDashboard(period);
  const { data: goals } = useGoals();

  // Make the active period explicit, e.g. "This month · 1–31 Jul 2026".
  const description = data
    ? `${PERIOD_NOUN[period]} · ${formatPeriodRange(data.range.start, data.range.end)}`
    : "Your money at a glance";

  // Tapping a category slice/row jumps to its transactions for the period.
  function openCategory(categoryId: string | null) {
    navigate(categoryId ? `/transactions?category=${categoryId}` : "/transactions?type=expense");
  }

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={description}
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
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Net worth
                </CardTitle>
                <Button asChild variant="ghost" size="sm" className="-mr-2 h-7 text-xs">
                  <Link to="/net-worth">Breakdown</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <CountUp
                  value={data.summary.netWorth}
                  className="tnum block text-3xl font-extrabold tracking-tight"
                />
                {(() => {
                  const included = data.accounts.filter((a) => a.includeInTotal);
                  return (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground transition-colors hover:text-foreground"
                        >
                          Sum of {included.length} {included.length === 1 ? "account" : "accounts"}
                          <Info className="h-3 w-3 shrink-0" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent align="start" className="max-w-[240px]">
                        <p className="mb-1 font-medium">Included in net worth</p>
                        <ul className="space-y-1">
                          {included.map((a) => (
                            <li key={a._id} className="flex items-center justify-between gap-4">
                              <span className="truncate">{a.name}</span>
                              <span className="tnum">
                                {formatMoney(a.balance ?? 0, { currency: a.currency })}
                              </span>
                            </li>
                          ))}
                          {included.length === 0 && <li className="text-muted-foreground">No accounts included</li>}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  );
                })()}
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
                  <>
                    <TrendArea data={data.trend} />
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      Net this period:{" "}
                      <span
                        className={`tnum font-semibold ${data.summary.net >= 0 ? "text-income" : "text-expense"}`}
                      >
                        {data.summary.net >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(data.summary.net))}
                      </span>{" "}
                      (income − expense)
                    </p>
                  </>
                ) : (
                  <EmptyChart />
                )}
              </CardContent>
            </Card>

            {/* accounts + live gold/silver rates */}
            <div className="space-y-4">
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
                    <Link
                      key={a._id}
                      to={`/accounts/${a._id}`}
                      className="flex items-center gap-3 rounded-lg py-1.5 transition-colors hover:bg-accent"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${a.color}1f`, color: a.color }}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{accountTypeLabel(a.type)}</p>
                      </div>
                      <span className="tnum shrink-0 text-sm font-semibold">
                        {formatMoney(a.balance ?? 0, { currency: a.currency })}
                      </span>
                    </Link>
                  );
                })}
                {!data.accounts.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">No accounts yet</p>
                )}
              </CardContent>
            </Card>
            <GoldRateCard />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* spending donut */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Spending by category</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/reports">View in Reports</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.byCategory.length ? (
                  <CategoryDonut
                    data={data.byCategory}
                    total={data.summary.expense}
                    onSelect={openCategory}
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
                      <TransactionRow key={t._id} txn={t} showDate />
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

          {/* upcoming recurring */}
          {data.upcoming.length > 0 && <UpcomingRecurring items={data.upcoming} />}

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
                  <Link
                    key={b._id}
                    to="/budgets"
                    className="block space-y-2 rounded-lg border p-3 transition-colors hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      <CategoryIcon
                        icon={b.category?.icon}
                        color={b.category?.color}
                        size="sm"
                      />
                      <span className="flex-1 truncate text-sm font-medium">
                        {b.category?.name ?? "Overall"}
                      </span>
                      {b.over ? (
                        <span className="shrink-0 text-xs font-medium text-expense">Over</span>
                      ) : b.percent >= 80 ? (
                        <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-500">Close</span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-income">On track</span>
                      )}
                    </div>
                    <Progress
                      value={Math.min(b.percent, 100)}
                      indicatorClassName={
                        b.over ? "bg-expense" : b.percent > 80 ? "bg-amber-500" : "bg-income"
                      }
                    />
                    <div className="flex items-center justify-between text-xs tnum">
                      <span className="text-muted-foreground">
                        {formatMoney(b.spent)} of {formatMoney(b.amount)}
                      </span>
                      <span className={`font-medium ${b.over ? "text-expense" : "text-income"}`}>
                        {b.over
                          ? `${formatMoney(b.spent - b.amount)} over`
                          : `${formatMoney(b.amount - b.spent)} left`}
                      </span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {/* goals */}
          {goals && goals.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" /> Goals
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/goals">Manage</Link>
                </Button>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {goals.slice(0, 3).map((g) => (
                  <Link key={g._id} to="/goals" className="space-y-2 rounded-lg border p-3 transition-colors hover:bg-accent">
                    <div className="flex items-center gap-2">
                      <CategoryIcon icon={g.icon} color={g.color} size="sm" />
                      <span className="flex-1 truncate text-sm font-medium">{g.name}</span>
                      {g.complete ? (
                        <Badge variant="income" className="shrink-0 text-[10px] font-medium">
                          Done
                        </Badge>
                      ) : (
                        <span className="tnum shrink-0 text-xs text-muted-foreground">{g.percent}%</span>
                      )}
                    </div>
                    <Progress value={g.percent} indicatorClassName={g.complete ? "bg-income" : undefined} />
                    <div className="flex justify-between text-xs text-muted-foreground tnum">
                      <span>{formatMoney(g.savedAmount)}</span>
                      <span>{formatMoney(g.targetAmount)}</span>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function UpcomingRecurring({ items }: { items: Recurring[] }) {
  const [posting, setPosting] = useState<Recurring | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" /> Due soon
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/recurring">Manage</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((r) => {
          const next = new Date(r.nextRun);
          const days = differenceInCalendarDays(next, new Date());
          const due = days <= 0; // today or overdue → postable
          const countdown =
            days < 0 ? "Overdue" : days === 0 ? "Due today" : days === 1 ? "Due tomorrow" : `Due in ${days} days`;
          const countdownTone =
            days < 0
              ? "text-expense"
              : days <= 3
                ? "text-amber-600 dark:text-amber-500"
                : "text-muted-foreground";
          const title = r.type === "transfer" ? "Transfer" : r.category?.name ?? (r.note || "Recurring");
          return (
            <div
              key={r._id}
              className={`flex items-center gap-3 rounded-lg border p-3 ${
                days < 0 ? "border-expense/40 bg-expense/5" : days <= 3 ? "border-amber-500/40 bg-amber-500/5" : ""
              }`}
            >
              <CategoryIcon
                icon={r.type === "transfer" ? "repeat" : r.category?.icon}
                color={r.type === "transfer" ? "#3B82F6" : r.category?.color}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  <span className="truncate">{title}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                    {freqLabel(r)}
                  </Badge>
                  {r.loan && (
                    <Badge variant="secondary" className="shrink-0 gap-0.5 text-[10px] font-normal">
                      <Landmark className="h-2.5 w-2.5" /> {r.loan.name}
                    </Badge>
                  )}
                </p>
                <p className={`truncate text-xs font-medium ${countdownTone}`}>
                  {countdown} · {format(next, "dd MMM")}
                </p>
              </div>
              <Money amount={r.amount} type={r.type} signed className="text-sm" />
              <Button size="sm" variant={due ? "default" : "outline"} onClick={() => setPosting(r)}>
                Post
              </Button>
            </div>
          );
        })}
      </CardContent>
      <PostRecurringDialog rule={posting} onClose={() => setPosting(null)} />
    </Card>
  );
}

const FREQ_UNIT: Record<Recurring["frequency"], string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

/** "Monthly" / "Every 2 weeks" from a recurring rule's frequency + interval. */
function freqLabel(r: Recurring): string {
  if (r.interval > 1) return `Every ${r.interval} ${FREQ_UNIT[r.frequency]}s`;
  return r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
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
