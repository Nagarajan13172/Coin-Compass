import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowRight, MoreVertical, Pencil, Plus, Target, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
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
import { categoryLabel, enumLabel } from "@/lib/i18nLabels";
import {
  BUDGET_PERIOD_ORDER,
  budgetPeriodToTxnPeriod,
  budgetStatus,
} from "@/lib/budgets";
import { useBudgets, useDeleteBudget } from "@/hooks/useBudgets";
import { useByCategory } from "@/hooks/useReports";
import { BudgetFormDialog } from "@/features/budgets/BudgetFormDialog";
import type { Budget, BudgetPeriod } from "@/lib/types";
import { toast } from "sonner";

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
  const { t } = useTranslation("planning");
  const { data: budgets, isLoading } = useBudgets();
  const del = useDeleteBudget();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
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
  async function confirmDelete(b: Budget) {
    try {
      await del.mutateAsync(b._id);
      toast.success(t("budgets.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contribute.failed"));
      throw e; // keep the confirm dialog open on failure
    }
  }

  const newBudgetPeriod = effectiveScope !== "all" ? effectiveScope : undefined;

  return (
    <div>
      <PageHeader
        title={t("budgets.title")}
        description={t("budgets.description")}
        actions={
          <Button onClick={() => openNew({ period: newBudgetPeriod })}>
            <Plus /> {t("budgets.newBudget")}
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
                  <TabsTrigger value="all">{t("labels.all", { ns: "common" })}</TabsTrigger>
                  {presentPeriods.map((p) => (
                    <TabsTrigger key={p} value={p}>
                      {enumLabel("frequency", p)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            ) : (
              <span />
            )}
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              {t("budgets.tracksAcrossAccounts")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((b, i) => {
              const status = budgetStatus(b);
              const statusLabel =
                status.badge === "expense"
                  ? t("budgets.status.overBy", { amount: formatMoney(Math.max(0, b.spent - b.amount)) })
                  : status.badge === "warning"
                    ? t("budgets.status.nearLimit")
                    : t("budgets.status.onTrack");
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
                          <p className="truncate font-semibold">
                            {b.category ? categoryLabel(b.category.name) : t("budgets.overall")}
                          </p>
                          <p className="text-xs text-muted-foreground">{t(`budgets.period.${b.period}`)}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={t("budgets.budgetActions")}>
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(b)}>
                              <Pencil /> {t("actions.edit", { ns: "common" })}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(b)}
                            >
                              <Trash2 /> {t("actions.delete", { ns: "common" })}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <Badge variant={status.badge} className="w-fit">
                        {statusLabel}
                      </Badge>

                      <Progress
                        value={Math.min(b.percent, 100)}
                        indicatorClassName={status.tone}
                        tooltip={
                          <span className="tnum">
                            {t("budgets.spentOfTotal", { spent: formatMoney(b.spent), total: formatMoney(b.amount) })} ·{" "}
                            {t("budgets.percentUsed", { percent: b.percent })} ·{" "}
                            {b.over
                              ? t("budgets.amountOver", { amount: formatMoney(b.spent - b.amount) })
                              : t("budgets.amountLeft", { amount: formatMoney(b.remaining) })}
                          </span>
                        }
                      />

                      <div className="flex items-center justify-between text-sm">
                        <span className="tnum text-muted-foreground">
                          {t("budgets.spentOfTotal", { spent: formatMoney(b.spent), total: formatMoney(b.amount) })}
                        </span>
                        {b.over ? (
                          <span className="tnum font-medium text-expense">
                            {t("budgets.percentUsed", { percent: b.percent })}
                          </span>
                        ) : b.spent === 0 ? (
                          <span className="text-xs text-muted-foreground">{t("budgets.noSpendingYet")}</span>
                        ) : (
                          <span className="tnum font-medium text-income">
                            {t("budgets.amountLeft", { amount: formatMoney(b.remaining) })}
                          </span>
                        )}
                      </div>

                      <div className="mt-auto border-t pt-3">
                        <Link
                          to={txnLink(b)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                          {t("budgets.viewTransactions")}
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
              <h2 className="text-sm font-semibold">{t("budgets.unbudgetedTitle")}</h2>
              <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
                {t("budgets.unbudgetedDescription")}
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suggestions.map((c) => (
                  <div key={c.categoryId} className="flex items-center gap-3 rounded-xl border p-3">
                    <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{categoryLabel(c.name)}</p>
                      <p className="tnum text-xs text-muted-foreground">
                        {t("budgets.amountSpent", { amount: formatMoney(c.total) })}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openNew({ category: c.categoryId, period: "monthly" })}
                    >
                      {t("budgets.setBudget")}
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
          title={t("budgets.emptyTitle")}
          description={t("budgets.emptyDescription")}
          action={
            <Button onClick={() => openNew()}>
              <Plus /> {t("budgets.newBudget")}
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
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="budget"
          confirmValue={String(deleteTarget.amount)}
          onConfirm={() => confirmDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
