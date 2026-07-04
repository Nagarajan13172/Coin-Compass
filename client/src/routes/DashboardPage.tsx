import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { format, differenceInCalendarDays } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, CalendarClock, HandCoins, Info, Landmark, PiggyBank, Plus, Receipt, Trophy, Wallet } from "lucide-react";
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
import { useCreditSummary } from "@/hooks/useCredits";
import { useCanSeeWealth, useMe } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { PostRecurringDialog } from "@/features/recurring/PostRecurringDialog";
import { useUIStore } from "@/stores/ui";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { bucketRange, formatPeriodRange, dateFnsLocale } from "@/lib/dates";
import { categoryLabel, enumLabel } from "@/lib/i18nLabels";
import type { PeriodKey, Recurring } from "@/lib/types";

export default function DashboardPage() {
  const { t } = useTranslation("dashboard");
  const navigate = useNavigate();
  const period = useUIStore((s) => s.period);
  const setPeriod = useUIStore((s) => s.setPeriod);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const { data, isLoading } = useDashboard(period);
  const { data: goals } = useGoals();
  const { data: creditSummary } = useCreditSummary();
  const { data: me } = useMe();
  const canSeeWealth = useCanSeeWealth();

  // Make the active period explicit, e.g. "This month · 1–31 Jul 2026".
  const description = data
    ? `${t(`period.${period}`)} · ${formatPeriodRange(data.range.start, data.range.end)}`
    : t("subtitle");

  // Warmer, personal page title based on the time of day.
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const part = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    const first = me?.name?.trim().split(" ")[0];
    return first ? t(`greeting.${part}Named`, { name: first }) : t(`greeting.${part}`);
  }, [me, t]);

  // Share of income kept this period (income − expense ÷ income), for the Net tile.
  const summary = data?.summary;
  const savingsRate = summary && summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : null;
  const savingsRateLabel =
    savingsRate == null
      ? t("savingsRate.none")
      : savingsRate >= 0
        ? t("savingsRate.saved", { percent: savingsRate })
        : t("savingsRate.over");

  // Quick insights strip. Avg/day divides by days *elapsed* so an in-progress
  // month isn't understated by counting days that haven't happened yet.
  const insights = useMemo(() => {
    if (!data) return null;
    const start = new Date(data.range.start);
    const end = new Date(data.range.end);
    const now = new Date();
    const effectiveEnd = end < now ? end : now;
    const days = Math.max(1, differenceInCalendarDays(effectiveEnd, start) + 1);
    return {
      avgDaily: data.summary.expense / days,
      biggest: data.byCategory[0] ?? null,
      txnCount: data.summary.incomeCount + data.summary.expenseCount,
    };
  }, [data]);

  // Money owed to you vs money you owe, rolled up from the per-person ledger.
  const credits = useMemo(() => {
    let owedToYou = 0;
    let youOwe = 0;
    for (const r of creditSummary ?? []) {
      if (r.net > 0) owedToYou += r.net;
      else if (r.net < 0) youOwe += -r.net;
    }
    return { owedToYou, youOwe, any: owedToYou > 0 || youOwe > 0 };
  }, [creditSummary]);

  // Tapping a category slice/row jumps to its transactions for the period.
  function openCategory(categoryId: string | null) {
    navigate(categoryId ? `/transactions?category=${categoryId}` : "/transactions?type=expense");
  }

  // Tapping a point on the cash-flow chart opens that day/month's transactions.
  function openBucket(bucket: string) {
    const r = bucketRange(bucket);
    if (r) navigate(`/transactions?from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`);
  }

  return (
    <div>
      <PageHeader
        title={greeting}
        description={description}
        actions={
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodKey)}>
            <TabsList className="h-9">
              <TabsTrigger value="week">{t("tabs.week")}</TabsTrigger>
              <TabsTrigger value="month">{t("tabs.month")}</TabsTrigger>
              <TabsTrigger value="year">{t("tabs.year")}</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <div className="space-y-5">
          {/* hero + summary — the net-worth hero is hidden in the everyday view */}
          <div className={cn("grid gap-4", canSeeWealth ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3")}>
            {canSeeWealth && (
            <Card className="surface-gradient lg:col-span-1">
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("netWorth.title")}
                </CardTitle>
                <Button asChild variant="ghost" size="sm" className="-mr-2 h-7 text-xs">
                  <Link to="/net-worth">{t("netWorth.breakdown")}</Link>
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
                          {t("netWorth.sumOf", { count: included.length })}
                          <Info className="h-3 w-3 shrink-0" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent align="start" className="max-w-[240px]">
                        <p className="mb-1 font-medium">{t("netWorth.includedTitle")}</p>
                        <ul className="space-y-1">
                          {included.map((a) => (
                            <li key={a._id} className="flex items-center justify-between gap-4">
                              <span className="truncate">{a.name}</span>
                              <span className="tnum">
                                {formatMoney(a.balance ?? 0, { currency: a.currency })}
                              </span>
                            </li>
                          ))}
                          {included.length === 0 && <li className="text-muted-foreground">{t("netWorth.noneIncluded")}</li>}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  );
                })()}
              </CardContent>
            </Card>
            )}

            <StatCard
              icon={<ArrowDownLeft className="h-5 w-5" />}
              label={t("txnType.income", { ns: "common" })}
              value={data.summary.income}
              tone="income"
              to="/transactions?type=income"
            />
            <StatCard
              icon={<ArrowUpRight className="h-5 w-5" />}
              label={t("txnType.expense", { ns: "common" })}
              value={data.summary.expense}
              tone="expense"
              to="/transactions?type=expense"
            />
            <StatCard
              icon={<PiggyBank className="h-5 w-5" />}
              label={t("stats.net")}
              value={data.summary.net}
              tone={data.summary.net >= 0 ? "income" : "expense"}
              signed
              sub={savingsRateLabel}
              to="/reports"
            />
          </div>

          {/* quick insights */}
          {insights && insights.txnCount > 0 && (
            <Card>
              <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3">
                <Insight label={t("insights.avgPerDay")} value={formatMoney(Math.round(insights.avgDaily))} />
                <Insight
                  label={t("insights.biggestCategory")}
                  value={insights.biggest ? categoryLabel(insights.biggest.name) : "—"}
                  sub={insights.biggest ? formatMoney(insights.biggest.total) : undefined}
                />
                <Insight
                  label={t("insights.transactions")}
                  value={String(insights.txnCount)}
                  className="col-span-2 sm:col-span-1"
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-3">
            {/* trend */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t("cashFlow.title")}</CardTitle>
                <div className="flex items-center gap-4 text-xs">
                  <Legend color="hsl(var(--income))" label={t("txnType.income", { ns: "common" })} />
                  <Legend color="hsl(var(--expense))" label={t("txnType.expense", { ns: "common" })} />
                </div>
              </CardHeader>
              <CardContent>
                {data.trend.length ? (
                  <>
                    <TrendArea data={data.trend} onSelect={openBucket} />
                    <p className="mt-2 text-center text-xs text-muted-foreground">
                      {t("cashFlow.netThisPeriod")}{" "}
                      <span
                        className={`tnum font-semibold ${data.summary.net >= 0 ? "text-income" : "text-expense"}`}
                      >
                        {data.summary.net >= 0 ? "+" : "−"}
                        {formatMoney(Math.abs(data.summary.net))}
                      </span>{" "}
                      {t("cashFlow.incomeMinusExpense")}
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
                <CardTitle>{t("accounts.title")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/accounts">{t("actions.viewAll", { ns: "common" })}</Link>
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
                        <p className="truncate text-xs text-muted-foreground">{enumLabel("account", a.type)}</p>
                      </div>
                      <span className="tnum shrink-0 text-sm font-semibold">
                        {formatMoney(a.balance ?? 0, { currency: a.currency })}
                      </span>
                    </Link>
                  );
                })}
                {!data.accounts.length && (
                  <p className="py-4 text-center text-sm text-muted-foreground">{t("accounts.empty")}</p>
                )}
              </CardContent>
            </Card>
            {credits.any && <CreditsSummaryCard owedToYou={credits.owedToYou} youOwe={credits.youOwe} />}
            <GoldRateCard />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* spending donut */}
            <Card className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t("spending.title")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/reports">{t("spending.viewInReports")}</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {data.byCategory.length ? (
                  <CategoryDonut
                    data={data.byCategory}
                    total={data.summary.expense}
                    onSelect={openCategory}
                    wideLegend
                  />
                ) : (
                  <EmptyState
                    icon={Receipt}
                    title={t("spending.emptyTitle")}
                    description={t("spending.emptyDescription")}
                  />
                )}
              </CardContent>
            </Card>

            {/* recent */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t("recent.title")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/transactions">{t("actions.viewAll", { ns: "common" })}</Link>
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
                    title={t("recent.emptyTitle")}
                    description={t("recent.emptyDescription")}
                    action={
                      <Button onClick={() => openTxnSheet({ type: "expense" })}>
                        <Plus /> {t("actions.addTransaction", { ns: "common" })}
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
                <CardTitle>{t("budgets.title")}</CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/budgets">{t("manage")}</Link>
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
                        {b.category ? categoryLabel(b.category.name) : t("budgets.overall")}
                      </span>
                      {b.over ? (
                        <span className="shrink-0 text-xs font-medium text-expense">{t("budgets.statusOver")}</span>
                      ) : b.percent >= 80 ? (
                        <span className="shrink-0 text-xs font-medium text-amber-600 dark:text-amber-500">{t("budgets.statusClose")}</span>
                      ) : (
                        <span className="shrink-0 text-xs font-medium text-income">{t("budgets.statusOnTrack")}</span>
                      )}
                    </div>
                    <Progress
                      value={Math.min(b.percent, 100)}
                      indicatorClassName={
                        b.over ? "bg-expense" : b.percent > 80 ? "bg-amber-500" : "bg-income"
                      }
                      tooltip={
                        <span className="tnum">
                          {t("budgets.amountOfTotal", { amount: formatMoney(b.spent), total: formatMoney(b.amount) })} · {b.percent}% ·{" "}
                          {b.over
                            ? t("budgets.overBy", { amount: formatMoney(b.spent - b.amount) })
                            : t("budgets.leftBy", { amount: formatMoney(b.amount - b.spent) })}
                        </span>
                      }
                    />
                    <div className="flex items-center justify-between text-xs tnum">
                      <span className="text-muted-foreground">
                        {t("budgets.amountOfTotal", { amount: formatMoney(b.spent), total: formatMoney(b.amount) })}
                      </span>
                      <span className={`font-medium ${b.over ? "text-expense" : "text-income"}`}>
                        {b.over
                          ? t("budgets.overBy", { amount: formatMoney(b.spent - b.amount) })
                          : t("budgets.leftBy", { amount: formatMoney(b.amount - b.spent) })}
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
                  <Trophy className="h-4 w-4 text-muted-foreground" /> {t("goals.title")}
                </CardTitle>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/goals">{t("manage")}</Link>
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
                          {t("goals.done")}
                        </Badge>
                      ) : (
                        <span className="tnum shrink-0 text-xs text-muted-foreground">{g.percent}%</span>
                      )}
                    </div>
                    <Progress
                      value={g.percent}
                      indicatorClassName={g.complete ? "bg-income" : undefined}
                      tooltip={
                        <span className="tnum">
                          {t("budgets.amountOfTotal", { amount: formatMoney(g.savedAmount), total: formatMoney(g.targetAmount) })} · {g.percent}%
                          {g.complete ? ` · ${t("goals.done")}` : ` · ${t("goals.toGo", { amount: formatMoney(g.remaining) })}`}
                        </span>
                      }
                    />
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
  const { t } = useTranslation("dashboard");
  const [posting, setPosting] = useState<Recurring | null>(null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-muted-foreground" /> {t("dueSoon.title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/recurring">{t("manage")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((r) => {
          const next = new Date(r.nextRun);
          const days = differenceInCalendarDays(next, new Date());
          const due = days <= 0; // today or overdue → postable
          const countdown =
            days < 0
              ? t("dueSoon.overdue")
              : days === 0
                ? t("dueSoon.dueToday")
                : days === 1
                  ? t("dueSoon.dueTomorrow")
                  : t("dueSoon.dueIn", { count: days });
          const countdownTone =
            days < 0
              ? "text-expense"
              : days <= 3
                ? "text-amber-600 dark:text-amber-500"
                : "text-muted-foreground";
          const title =
            r.type === "transfer"
              ? t("txnType.transfer", { ns: "common" })
              : r.category
                ? categoryLabel(r.category.name)
                : r.note || t("dueSoon.recurring");
          return (
            <div
              key={r._id}
              className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 ${
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
                    {freqLabel(r, t)}
                  </Badge>
                  {r.loan && (
                    <Badge variant="secondary" className="shrink-0 gap-0.5 text-[10px] font-normal">
                      <Landmark className="h-2.5 w-2.5" /> {r.loan.name}
                    </Badge>
                  )}
                </p>
                <p className={`truncate text-xs font-medium ${countdownTone}`}>
                  {countdown} · {format(next, "dd MMM", { locale: dateFnsLocale() })}
                </p>
              </div>
              <Money amount={r.amount} type={r.type} signed className="text-sm" />
              <Button size="sm" variant={due ? "default" : "outline"} onClick={() => setPosting(r)}>
                {t("dueSoon.post")}
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
function freqLabel(r: Recurring, t: TFunction): string {
  if (r.interval > 1) return t(`freq.every.${FREQ_UNIT[r.frequency]}`, { count: r.interval });
  return enumLabel("frequency", r.frequency);
}

function StatCard({
  icon,
  label,
  value,
  tone,
  to,
  sub,
  signed,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "income" | "expense";
  /** When set, the whole tile links here. */
  to?: string;
  /** Small caption under the amount (e.g. the savings rate). */
  sub?: React.ReactNode;
  /** Prefix a +/− sign and colour by sign — used for Net, which can be negative. */
  signed?: boolean;
}) {
  const toneClass = tone === "income" ? "text-income" : "text-expense";
  const body = (
    <CardContent className="flex items-center gap-4 p-5">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          tone === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        {signed ? (
          <p className={`tnum text-xl font-bold ${toneClass}`}>
            {value >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(value))}
          </p>
        ) : (
          <Money amount={value} className={`text-xl ${toneClass}`} />
        )}
        {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
      </div>
    </CardContent>
  );

  if (to) {
    return (
      <Link to={to} className="block">
        <Card className="h-full transition-colors hover:bg-accent">{body}</Card>
      </Link>
    );
  }
  return <Card>{body}</Card>;
}

function Insight({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-base font-semibold">{value}</p>
      {sub && <p className="tnum text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function CreditsSummaryCard({ owedToYou, youOwe }: { owedToYou: number; youOwe: number }) {
  const { t } = useTranslation("dashboard");
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="h-4 w-4 text-muted-foreground" /> {t("credits.title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/credits">{t("actions.viewAll", { ns: "common" })}</Link>
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3">
        <Link to="/credits" className="rounded-lg border p-3 transition-colors hover:bg-accent">
          <p className="text-xs text-muted-foreground">{t("credits.owedToYou")}</p>
          <p className="tnum text-lg font-bold text-income">{formatMoney(owedToYou)}</p>
        </Link>
        <Link to="/credits" className="rounded-lg border p-3 transition-colors hover:bg-accent">
          <p className="text-xs text-muted-foreground">{t("credits.youOwe")}</p>
          <p className="tnum text-lg font-bold text-expense">{formatMoney(youOwe)}</p>
        </Link>
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
  const { t } = useTranslation("dashboard");
  return (
    <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
      {t("cashFlow.noData")}
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
