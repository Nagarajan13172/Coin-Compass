import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { Landmark, MoreVertical, Pencil, PiggyBank, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryDonut } from "@/features/reports/CategoryDonut";
import { HoldingFormDialog } from "@/features/networth/HoldingFormDialog";
import { useHoldings, useDeleteHolding } from "@/hooks/useHoldings";
import { useLoans } from "@/hooks/useLoans";
import { useAccounts } from "@/hooks/useAccounts";
import { useByCategory, useSummary } from "@/hooks/useReports";
import { periodRange } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { SUBTYPE_META, CLASS_META } from "@/lib/networth";
import type { CategoryDatum, Holding, HoldingClass } from "@/lib/types";
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

  const monthRange = useMemo(() => {
    const { start, end } = periodRange("month", new Date());
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);
  const summary = useSummary(monthRange);
  const expenseCats = useByCategory({ ...monthRange, type: "expense" });

  const totals = useMemo(() => {
    const saving = (holdings ?? []).filter((h) => h.class === "saving").reduce((s, h) => s + h.value, 0);
    const investment = (holdings ?? [])
      .filter((h) => h.class === "investment")
      .reduce((s, h) => s + h.value, 0);
    const accountsTotal = (accounts ?? [])
      .filter((a) => a.includeInTotal)
      .reduce((s, a) => s + (a.balance ?? 0), 0);
    const holdingsTotal = saving + investment;
    const assets = accountsTotal + holdingsTotal;
    const liabilities = (loans ?? [])
      .filter((l) => l.status === "active")
      .reduce((s, l) => s + l.outstanding, 0);
    return { saving, investment, accountsTotal, holdingsTotal, assets, liabilities, netWorth: assets - liabilities };
  }, [holdings, loans, accounts]);

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

  return (
    <div>
      <PageHeader title="Net Worth" description="Your assets, investments and loans in one place" />

      {/* summary */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="surface-gradient">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Net worth</p>
            <p className={`tnum text-3xl font-extrabold ${totals.netWorth < 0 ? "text-expense" : ""}`}>
              {formatMoney(totals.netWorth)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Assets − liabilities</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total assets</p>
            <p className="tnum text-2xl font-bold text-income">{formatMoney(totals.assets)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatMoney(totals.accountsTotal)} accounts · {formatMoney(totals.holdingsTotal)} holdings
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total liabilities</p>
            <p className="tnum text-2xl font-bold text-expense">{formatMoney(totals.liabilities)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Outstanding on active loans</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
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
        </TabsContent>

        <TabsContent value="assets">
          <AssetsTab holdings={holdings} loading={holdingsLoading} />
        </TabsContent>
      </Tabs>
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

function AssetsTab({ holdings, loading }: { holdings: Holding[] | undefined; loading: boolean }) {
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

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <Plus /> Add asset
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : holdings && holdings.length > 0 ? (
        <div className="space-y-6">
          {groups.map(
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
          )}
        </div>
      ) : (
        <EmptyState
          icon={Landmark}
          title="No assets yet"
          description="Add deposits, funds, stocks, gold or property to track your wealth."
          action={
            <Button onClick={openNew}>
              <Plus /> Add asset
            </Button>
          }
        />
      )}

      <HoldingFormDialog open={open} onOpenChange={setOpen} holding={editing} />
    </div>
  );
}
