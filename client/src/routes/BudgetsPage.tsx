import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, MoreVertical, Pencil, Plus, Target, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { formatMoney } from "@/lib/format";
import { periodRange } from "@/lib/dates";
import {
  BUDGET_PERIOD_LABEL,
  BUDGET_PERIOD_ORDER,
  budgetPeriodToTxnPeriod,
  budgetStatus,
} from "@/lib/budgets";
import { useBudgets, useDeleteBudget } from "@/hooks/useBudgets";
import { useByCategory } from "@/hooks/useReports";
import { BudgetFormDialog } from "@/features/budgets/BudgetFormDialog";
import type { Budget, BudgetPeriod } from "@/lib/types";
import { toast } from "sonner";

const SCOPE_TAB_LABEL: Record<BudgetPeriod, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  yearly: "Yearly",
};

/** Deep-link to Transactions filtered by this budget's category (and period, when it maps). */
function txnLink(b: Budget): string {
  const params = new URLSearchParams();
  if (b.category?._id) params.set("category", b.category._id);
  const tp = budgetPeriodToTxnPeriod(b.period);
  if (tp) params.set("period", tp);
  const qs = params.toString();
  return `/transactions${qs ? `?${qs}` : ""}`;
}

export default function BudgetsPage() {
  const { data: budgets, isLoading } = useBudgets();
  const del = useDeleteBudget();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [createDefaults, setCreateDefaults] = useState<{ category?: string | null; period?: BudgetPeriod }>({});
  const [scope, setScope] = useState<"all" | BudgetPeriod>("all");

  // Which periods actually have budgets — the scope selector only appears when it helps.
  const presentPeriods = useMemo(
    () => BUDGET_PERIOD_ORDER.filter((p) => budgets?.some((b) => b.period === p)),
    [budgets]
  );
  const showScope = presentPeriods.length > 1;
  const effectiveScope = showScope ? scope : "all";
  const visible = useMemo(
    () => (budgets ?? []).filter((b) => effectiveScope === "all" || b.period === effectiveScope),
    [budgets, effectiveScope]
  );

  // "Unbudgeted spending" — expense categories with spend this month but no budget yet.
  const monthRange = useMemo(() => {
    const { start, end } = periodRange("month", new Date());
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);
  const { data: byCategory } = useByCategory({ ...monthRange, type: "expense" });
  const suggestions = useMemo(() => {
    if (!budgets?.length) return [];
    // An "Overall" budget already caps every category, so per-category nudges are moot.
    if (budgets.some((b) => !b.category)) return [];
    const budgeted = new Set(budgets.map((b) => b.category?._id).filter(Boolean));
    return (byCategory ?? [])
      .filter((c) => c.categoryId && c.total > 0 && !budgeted.has(c.categoryId))
      .slice(0, 4);
  }, [budgets, byCategory]);

  function openNew(defaults: { category?: string | null; period?: BudgetPeriod } = {}) {
    setEditing(null);
    setCreateDefaults(defaults);
    setDialogOpen(true);
  }
  function openEdit(b: Budget) {
    setEditing(b);
    setCreateDefaults({});
    setDialogOpen(true);
  }
  async function handleDelete(b: Budget) {
    if (!confirm("Delete this budget?")) return;
    await del.mutateAsync(b._id);
    toast.success("Budget deleted");
  }

  const newBudgetPeriod = effectiveScope !== "all" ? effectiveScope : undefined;

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Set spending limits and track progress"
        actions={
          <Button onClick={() => openNew({ period: newBudgetPeriod })}>
            <Plus /> New budget
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : budgets && budgets.length > 0 ? (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {showScope ? (
              <Tabs value={scope} onValueChange={(v) => setScope(v as "all" | BudgetPeriod)}>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  {presentPeriods.map((p) => (
                    <TabsTrigger key={p} value={p}>
                      {SCOPE_TAB_LABEL[p]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <span />
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              Budgets track spending across all your accounts.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((b, i) => {
              const status = budgetStatus(b);
              return (
                <motion.div
                  key={b._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <Card className="h-full">
                    <CardContent className="flex h-full flex-col gap-3 p-5">
                      <div className="flex items-start gap-3">
                        <CategoryIcon icon={b.category?.icon} color={b.category?.color} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold">{b.category?.name ?? "Overall"}</p>
                          <p className="text-xs text-muted-foreground">{BUDGET_PERIOD_LABEL[b.period]}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Budget actions">
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(b)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(b)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <Badge variant={status.badge} className="w-fit">
                        {status.label}
                      </Badge>

                      <Progress
                        value={Math.min(b.percent, 100)}
                        indicatorClassName={status.tone}
                        tooltip={
                          <span className="tnum">
                            {formatMoney(b.spent)} of {formatMoney(b.amount)} · {b.percent}% used ·{" "}
                            {b.over
                              ? `${formatMoney(b.spent - b.amount)} over`
                              : `${formatMoney(b.remaining)} left`}
                          </span>
                        }
                      />

                      <div className="flex items-center justify-between text-sm">
                        <span className="tnum text-muted-foreground">
                          {formatMoney(b.spent)} of {formatMoney(b.amount)}
                        </span>
                        {b.over ? (
                          <span className="tnum font-medium text-expense">{b.percent}% used</span>
                        ) : b.spent === 0 ? (
                          <span className="text-xs text-muted-foreground">No spending yet</span>
                        ) : (
                          <span className="tnum font-medium text-income">{formatMoney(b.remaining)} left</span>
                        )}
                      </div>

                      <div className="mt-auto border-t pt-3">
                        <Link
                          to={txnLink(b)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          View transactions
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          {suggestions.length > 0 && (
            <section className="mt-8">
              <h2 className="text-sm font-semibold">Unbudgeted spending this month</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                You've spent in these categories but haven't set a budget yet.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((c) => (
                  <div key={c.categoryId} className="flex items-center gap-3 rounded-xl border p-3">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="tnum text-xs text-muted-foreground">{formatMoney(c.total)} spent</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openNew({ category: c.categoryId, period: "monthly" })}
                    >
                      Set budget
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Create a budget to keep your spending on track."
          action={
            <Button onClick={() => openNew()}>
              <Plus /> New budget
            </Button>
          }
        />
      )}

      <BudgetFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        budget={editing}
        defaultCategory={createDefaults.category}
        defaultPeriod={createDefaults.period}
      />
    </div>
  );
}
