import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  HandCoins,
  Landmark,
  MoreVertical,
  Pencil,
  PiggyBank,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryDonut } from "@/features/reports/CategoryDonut";
import { HoldingFormDialog } from "@/features/networth/HoldingFormDialog";
import { NetWorthTrend } from "@/features/networth/NetWorthTrend";
import { useHoldings, useDeleteHolding } from "@/hooks/useHoldings";
import { useLoans } from "@/hooks/useLoans";
import { useAccounts } from "@/hooks/useAccounts";
import { useNetWorthHistory } from "@/hooks/useNetWorth";
import { useByCategory, useSummary } from "@/hooks/useReports";
import { periodRange } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { SUBTYPE_META, CLASS_META, CHART_PALETTE, LOAN_TYPE_META, holdingGrowth } from "@/lib/networth";
import type { Account, CategoryDatum, Holding, HoldingClass, Loan } from "@/lib/types";
import { toast } from "sonner";

/** Group a class's holdings into donut data by subtype. */
function holdingsToData(list: Holding[]): CategoryDatum[] {
  const total = list.reduce((s, h) => s + h.value, 0);
  const bySub = new Map<string, { value: number; count: number }>();
  for (const h of list) {
    const cur = bySub.get(h.subtype) ?? { value: 0, count: 0 };
    cur.value += h.value;
    cur.count += 1;
    bySub.set(h.subtype, cur);
  }
  return [...bySub.entries()]
    .map(([sub, v]) => {
      const meta = SUBTYPE_META[sub as keyof typeof SUBTYPE_META];
      return {
        categoryId: sub,
        name: meta.label,
        color: meta.color,
        icon: meta.icon,
        total: v.value,
        count: v.count,
        percent: total > 0 ? Math.round((v.value / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

export default function NetWorthPage() {
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();
  const { data: loans } = useLoans();
  const { data: accounts } = useAccounts();
  const history = useNetWorthHistory();

  const monthRange = useMemo(() => {
    const { start, end } = periodRange("month", new Date());
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);
  const summary = useSummary(monthRange);
  const expenseCats = useByCategory({ ...monthRange, type: "expense" });

  const includedAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.includeInTotal && !a.archived),
    [accounts]
  );
  const activeLoans = useMemo(() => (loans ?? []).filter((l) => l.status === "active"), [loans]);

  const totals = useMemo(() => {
    const saving = (holdings ?? []).filter((h) => h.class === "saving").reduce((s, h) => s + h.value, 0);
    const investment = (holdings ?? [])
      .filter((h) => h.class === "investment")
      .reduce((s, h) => s + h.value, 0);
    const accountsTotal = includedAccounts.reduce((s, a) => s + (a.balance ?? 0), 0);
    const holdingsTotal = saving + investment;
    const assets = accountsTotal + holdingsTotal;
    const liabilities = activeLoans.reduce((s, l) => s + l.outstanding, 0);
    return { saving, investment, accountsTotal, holdingsTotal, assets, liabilities, netWorth: assets - liabilities };
  }, [holdings, includedAccounts, activeLoans]);

  const expenditure = summary.data?.expense ?? 0;

  const overviewData: CategoryDatum[] = useMemo(() => {
    const items = [
      { categoryId: "expenditure", name: "Expenditure", color: "#EF4444", icon: "receipt", total: expenditure },
      { categoryId: "saving", name: "Saving", color: "#10B981", icon: "piggy-bank", total: totals.saving },
      { categoryId: "investment", name: "Investment", color: "#6366F1", icon: "trending-up", total: totals.investment },
    ].filter((d) => d.total > 0);
    const sum = items.reduce((s, d) => s + d.total, 0);
    return items.map((d) => ({ ...d, count: 0, percent: sum > 0 ? Math.round((d.total / sum) * 100) : 0 }));
  }, [expenditure, totals.saving, totals.investment]);

  const savingData = useMemo(() => holdingsToData((holdings ?? []).filter((h) => h.class === "saving")), [holdings]);
  const investmentData = useMemo(
    () => holdingsToData((holdings ?? []).filter((h) => h.class === "investment")),
    [holdings]
  );

  const negative = totals.netWorth < 0;
  // A one-line read of what the number means, so a negative figure isn't left unexplained.
  const netWorthNote = negative
    ? "You owe more than you own — paying down loans lifts this."
    : totals.assets === 0 && totals.liabilities === 0
      ? "Add accounts, holdings or loans to see your net worth."
      : totals.liabilities === 0
        ? "Debt-free — every rupee is yours."
        : "Your assets comfortably cover what you owe.";

  return (
    <div>
      <PageHeader title="Net Worth" description="Your assets, investments and loans in one place" />

      {/* summary */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="surface-gradient">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Net worth</p>
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                  negative ? "bg-expense/10 text-expense" : "bg-income/10 text-income"
                }`}
              >
                {negative ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              </span>
            </div>
            <p className={`tnum text-3xl font-extrabold ${negative ? "text-expense" : "text-income"}`}>
              {formatMoney(totals.netWorth)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{netWorthNote}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total assets</p>
              <Link
                to="/accounts"
                className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
              >
                Accounts <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <p className="tnum text-2xl font-bold text-income">{formatMoney(totals.assets)}</p>
            <div className="mt-2 space-y-1 text-xs">
              <MiniRow label="Accounts" value={formatMoney(totals.accountsTotal)} />
              <MiniRow
                label="Holdings"
                value={totals.holdingsTotal > 0 ? formatMoney(totals.holdingsTotal) : "none yet"}
                muted={totals.holdingsTotal === 0}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total liabilities</p>
              {activeLoans.length > 0 && (
                <Link
                  to="/loans"
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline"
                >
                  Loans <ArrowRight className="h-3 w-3" />
                </Link>
              )}
            </div>
            <p className="tnum text-2xl font-bold text-expense">{formatMoney(totals.liabilities)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeLoans.length > 0
                ? `Outstanding across ${activeLoans.length} active loan${activeLoans.length === 1 ? "" : "s"}`
                : "No active loans"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="liabilities">Liabilities</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-4">
            <NetWorthTrend data={history.data} loading={history.isLoading} />
            <OverviewTab
              overviewData={overviewData}
              savingData={savingData}
              investmentData={investmentData}
              expenseCats={expenseCats.data ?? []}
              expenditure={expenditure}
              savingTotal={totals.saving}
              investmentTotal={totals.investment}
              loading={holdingsLoading || summary.isLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="assets">
          <AssetsTab holdings={holdings} accounts={includedAccounts} loading={holdingsLoading} />
        </TabsContent>

        <TabsContent value="liabilities">
          <LiabilitiesTab loans={activeLoans} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tnum font-medium ${muted ? "text-muted-foreground" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

/** Gain + time-to-maturity line for deposit-style holdings; renders nothing for bare ones. */
function HoldingGrowthLine({ holding }: { holding: Holding }) {
  const g = useMemo(
    () =>
      holdingGrowth(
        {
          invested: holding.investedAmount,
          maturityValue: holding.maturityValue,
          rate: holding.interestRate,
          startDate: holding.startDate,
          maturityDate: holding.maturityDate,
        },
        new Date()
      ),
    [holding]
  );

  const invested = holding.investedAmount ?? null;
  if (g.gain == null && g.progressPct == null) return null;

  return (
    <div className="mt-1 space-y-1">
      {g.gain != null && invested != null && (
        <p className="truncate text-xs">
          <span className="text-muted-foreground">Invested {formatMoney(invested)} · </span>
          <span className={g.gain >= 0 ? "text-income" : "text-expense"}>
            {g.gain >= 0 ? "+" : "−"}
            {formatMoney(Math.abs(g.gain))}
            {g.gainPct != null ? ` (${Math.round(g.gainPct)}%)` : ""}
          </span>
        </p>
      )}
      {g.progressPct != null && (
        <div className="flex items-center gap-1.5">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-income" style={{ width: `${g.progressPct}%` }} />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
            {g.progressPct >= 100 ? "Matured" : `${Math.round(g.progressPct)}%`}
          </span>
        </div>
      )}
    </div>
  );
}

// ---- Overview tab ----

function OverviewTab({
  overviewData,
  savingData,
  investmentData,
  expenseCats,
  expenditure,
  savingTotal,
  investmentTotal,
  loading,
}: {
  overviewData: CategoryDatum[];
  savingData: CategoryDatum[];
  investmentData: CategoryDatum[];
  expenseCats: CategoryDatum[];
  expenditure: number;
  savingTotal: number;
  investmentTotal: number;
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (!overviewData.length) {
    return (
      <EmptyState
        icon={PiggyBank}
        title="Nothing to show yet"
        description="Add savings, investments or spend a little this month to see your money map."
      />
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Money map — this month</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryDonut
            data={overviewData}
            total={expenditure + savingTotal + investmentTotal}
            centerLabel="Total"
            wideLegend
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Expenditure is this month's spending; Saving &amp; Investment are current balances.
          </p>
        </CardContent>
      </Card>

      <DonutCard title="Expenditure breakdown" data={expenseCats} centerLabel="Spent" empty="No spending this month." />
      <DonutCard title="Saving breakdown" data={savingData} centerLabel="Saved" empty="No savings added yet." />
      <DonutCard
        title="Investment breakdown"
        data={investmentData}
        centerLabel="Invested"
        empty="No investments added yet."
      />
    </div>
  );
}

function DonutCard({
  title,
  data,
  centerLabel,
  empty,
}: {
  title: string;
  data: CategoryDatum[];
  centerLabel: string;
  empty: string;
}) {
  const total = data.reduce((s, d) => s + d.total, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length ? (
          <CategoryDonut data={data} total={total} centerLabel={centerLabel} />
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">{empty}</div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- Assets tab ----

function AssetsTab({
  holdings,
  accounts,
  loading,
}: {
  holdings: Holding[] | undefined;
  accounts: Account[];
  loading: boolean;
}) {
  const del = useDeleteHolding();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Holding | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  async function handleDelete(h: Holding) {
    if (!confirm(`Delete "${h.name}"?`)) return;
    await del.mutateAsync(h._id);
    toast.success("Asset deleted");
  }

  const groups: { cls: HoldingClass; items: Holding[] }[] = [
    { cls: "saving", items: (holdings ?? []).filter((h) => h.class === "saving") },
    { cls: "investment", items: (holdings ?? []).filter((h) => h.class === "investment") },
  ];
  const accountsTotal = accounts.reduce((s, a) => s + (a.balance ?? 0), 0);
  const hasHoldings = Boolean(holdings && holdings.length > 0);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus /> Add asset
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <div className="space-y-6">
          {/* Cash accounts — these count toward assets, so surface them here too. */}
          <div>
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">Cash &amp; accounts</h3>
                <Link to="/accounts" className="text-xs font-medium text-primary hover:underline">
                  Manage
                </Link>
              </div>
              <span className="tnum text-sm text-muted-foreground">{formatMoney(accountsTotal)}</span>
            </div>
            {accounts.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {accounts.map((a) => (
                  <Link key={a._id} to={`/accounts/${a._id}`} className="block">
                    <Card className="transition-colors hover:bg-accent">
                      <CardContent className="flex items-center gap-3 p-4">
                        <CategoryIcon icon={a.icon} color={a.color} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.name}</p>
                          <p className="truncate text-xs capitalize text-muted-foreground">{a.type}</p>
                        </div>
                        <span className="tnum text-sm font-semibold">{formatMoney(a.balance ?? 0)}</span>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="px-1 text-sm text-muted-foreground">No accounts counted in your total.</p>
            )}
          </div>

          {/* Holdings — savings & investments */}
          {hasHoldings ? (
            groups.map(
              ({ cls, items }) =>
                items.length > 0 && (
                  <div key={cls}>
                    <div className="mb-2 flex items-center justify-between px-1">
                      <h3 className="text-sm font-semibold">{CLASS_META[cls].label}</h3>
                      <span className="tnum text-sm text-muted-foreground">
                        {formatMoney(items.reduce((s, h) => s + h.value, 0))}
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((h, i) => (
                        <motion.div
                          key={h._id}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
                        >
                          <Card>
                            <CardContent className="flex items-center gap-3 p-4">
                              <CategoryIcon
                                icon={SUBTYPE_META[h.subtype].icon}
                                color={SUBTYPE_META[h.subtype].color}
                                size="md"
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{h.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {SUBTYPE_META[h.subtype].label}
                                  {h.provider ? ` · ${h.provider}` : ""}
                                </p>
                                <HoldingGrowthLine holding={h} />
                              </div>
                              <span className="tnum text-sm font-semibold">{formatMoney(h.value)}</span>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon-sm" aria-label="Asset actions">
                                    <MoreVertical />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditing(h);
                                      setOpen(true);
                                    }}
                                  >
                                    <Pencil /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onClick={() => handleDelete(h)}
                                  >
                                    <Trash2 /> Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </CardContent>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )
            )
          ) : (
            <EmptyState
              icon={Landmark}
              title="No investments or savings linked yet"
              description="Add deposits, funds, stocks, gold or property so your net worth reflects everything you own."
              action={
                <Button onClick={openNew}>
                  <Plus /> Add holding
                </Button>
              }
            />
          )}
        </div>
      )}

      <HoldingFormDialog open={open} onOpenChange={setOpen} holding={editing} />
    </div>
  );
}

// ---- Liabilities tab ----

function LiabilitiesTab({ loans }: { loans: Loan[] }) {
  if (!loans.length) {
    return (
      <EmptyState
        icon={HandCoins}
        title="No liabilities"
        description="You have no active loans. Track a loan to see it reduce your net worth here."
        action={
          <Button asChild>
            <Link to="/loans">
              <Plus /> Add a loan
            </Link>
          </Button>
        }
      />
    );
  }

  const total = loans.reduce((s, l) => s + l.outstanding, 0);
  const byOutstanding = [...loans].sort((a, b) => b.outstanding - a.outstanding);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link to="/loans">
            <HandCoins /> Manage loans
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Outstanding by loan</CardTitle>
          <CardDescription>Each loan's share of the {formatMoney(total)} you owe.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3.5">
            {byOutstanding.map((l, i) => {
              const share = total > 0 ? (l.outstanding / total) * 100 : 0;
              const color = CHART_PALETTE[i % CHART_PALETTE.length];
              return (
                <li key={l._id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <CategoryIcon icon={LOAN_TYPE_META[l.type].icon} color={color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{l.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {LOAN_TYPE_META[l.type].label}
                        {l.lender ? ` · ${l.lender}` : ""}
                      </span>
                    </div>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">{Math.round(share)}%</span>
                    <span className="tnum shrink-0 font-semibold">{formatMoney(l.outstanding)}</span>
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="h-2 w-full cursor-default overflow-hidden rounded-full bg-secondary"
                        role="progressbar"
                        aria-valuenow={Math.round(share)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${l.name} — ${Math.round(share)}% of total outstanding`}
                      >
                        <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      <p className="font-medium">{l.name}</p>
                      <p className="tnum text-background/80">
                        {formatMoney(l.outstanding)} · {share.toFixed(1)}% of {formatMoney(total)}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
