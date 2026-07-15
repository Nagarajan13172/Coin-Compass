import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useSummary, useByCategory } from "@/hooks/useReports";
import { useTransactionList } from "@/hooks/useTransactions";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import type { RefLite, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

function refName(v: RefLite | string | null | undefined): string {
  return v && typeof v === "object" ? v.name : "";
}

/** A one-off's display label: its note, else payee, else its category name. */
function oneoffLabel(txn: Transaction, fallback: string): string {
  const note = txn.note?.trim();
  const cat = refName(txn.category);
  return note || txn.payee?.trim() || (cat ? categoryLabel(cat) : "") || fallback;
}

/**
 * A compact, sticky summary of the currently-selected period, shown beside the
 * transaction list on wide screens so the empty right-hand space earns its keep.
 * Reuses the existing /reports endpoints (which already accept from/to), so it
 * reflects the whole window — not just the transactions loaded into the list.
 *
 * The list's period range uses an EXCLUSIVE upper bound (start of next month),
 * whereas /reports treats `to` as an inclusive day and adds 24h — so we pass the
 * day before the exclusive bound to line the two up exactly. The itemised one-off
 * list, however, hits the transactions endpoint directly and so uses the raw
 * exclusive range.
 */
export function MonthSummaryRail({
  range,
  label,
  onSelectCategory,
  onSelectOneoff,
}: {
  range: { from?: string; to?: string };
  label: string;
  onSelectCategory: (categoryId: string | null) => void;
  onSelectOneoff: () => void;
}) {
  const { t } = useTranslation("transactions");

  const params = useMemo(() => {
    const from = range.from ?? new Date(0).toISOString();
    const to = range.to
      ? new Date(new Date(range.to).getTime() - 86_400_000).toISOString()
      : undefined;
    return { from, to };
  }, [range.from, range.to]);

  const { data: summary, isLoading } = useSummary(params);
  const { data: byCategory } = useByCategory({ ...params, type: "expense" });

  const oneoffExpense = summary?.oneoffExpense ?? 0;
  const regular = (summary?.expense ?? 0) - oneoffExpense;
  const hasOneoff = oneoffExpense > 0;

  // The actual one-off spends this period, to itemise them (only fetched when there are any).
  const { data: oneoffItems } = useTransactionList(
    { from: range.from, to: range.to, type: "expense", oneoff: true },
    50,
    hasOneoff
  );

  const savingsRate =
    summary && summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : null;
  const topCategories = (byCategory ?? []).slice(0, 4);
  const txnCount = (summary?.incomeCount ?? 0) + (summary?.expenseCount ?? 0);
  const hasActivity = txnCount > 0;

  return (
    <div className="sticky top-4 space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <Link
          to="/reports"
          className="flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("summaryRail.report")}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !hasActivity ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Receipt className="h-6 w-6 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">{t("summaryRail.noActivity")}</p>
            </div>
          ) : (
            <>
              {/* net for the period */}
              <div>
                <p className="text-xs text-muted-foreground">{t("summaryRail.net")}</p>
                <p
                  className={cn(
                    "tnum text-2xl font-bold tracking-tight",
                    (summary?.net ?? 0) >= 0 ? "text-income" : "text-expense"
                  )}
                >
                  {(summary?.net ?? 0) >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(summary?.net ?? 0))}
                </p>
                {savingsRate != null && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {savingsRate >= 0
                      ? t("summaryRail.saved", { percent: savingsRate })
                      : t("summaryRail.overspent")}
                  </p>
                )}
              </div>

              {/* in / out */}
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
                  tone="income"
                  label={t("summaryRail.in")}
                  value={formatMoney(summary?.income ?? 0)}
                />
                <Stat
                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  tone="expense"
                  label={t("summaryRail.out")}
                  value={formatMoney(summary?.expense ?? 0)}
                />
              </div>

              {/* regular vs one-off — so a lumpy month reads as "normal + extras" */}
              {hasOneoff && (
                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("summaryRail.spendSplit")}
                    </span>
                    <button
                      type="button"
                      onClick={onSelectOneoff}
                      className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {t("summaryRail.viewOneoffs")}
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("summaryRail.regular")}</span>
                    <span className="tnum font-semibold text-foreground">{formatMoney(regular)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-amber-600 dark:text-amber-500">{t("summaryRail.oneoff")}</span>
                    <span className="tnum font-semibold text-amber-600 dark:text-amber-500">
                      {formatMoney(oneoffExpense)}
                    </span>
                  </div>
                  {oneoffItems && oneoffItems.length > 0 && (
                    <ul className="space-y-1 pt-0.5">
                      {oneoffItems.slice(0, 4).map((it) => (
                        <li
                          key={it._id}
                          className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"
                        >
                          <span className="truncate">
                            {oneoffLabel(it, t("summaryRail.oneoff"))}
                          </span>
                          <span className="tnum shrink-0">{formatMoney(it.amount)}</span>
                        </li>
                      ))}
                      {oneoffItems.length > 4 && (
                        <li className="text-[11px] text-muted-foreground/70">
                          {t("summaryRail.moreOneoffs", { count: oneoffItems.length - 4 })}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}

              {/* top spending categories */}
              {topCategories.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    {t("summaryRail.topSpending")}
                  </p>
                  <div className="space-y-2">
                    {topCategories.map((c) => (
                      <button
                        type="button"
                        key={c.categoryId ?? c.name}
                        onClick={() => onSelectCategory(c.categoryId)}
                        className="group flex w-full items-center gap-2 text-left"
                      >
                        <CategoryIcon icon={c.icon} color={c.color} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-xs font-medium group-hover:underline">
                              {categoryLabel(c.name)}
                            </span>
                            <span className="tnum shrink-0 text-xs text-muted-foreground">
                              {formatMoney(c.total)}
                            </span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${Math.max(4, c.percent)}%`, backgroundColor: c.color }}
                            />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="border-t pt-3 text-center text-xs text-muted-foreground">
                {t("summaryRail.txnCount", { count: txnCount })}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "income" | "expense";
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border p-2.5">
      <span
        className={cn(
          "mb-1 flex h-6 w-6 items-center justify-center rounded-md",
          tone === "income" ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
        )}
      >
        {icon}
      </span>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tnum truncate text-sm font-semibold", tone === "income" ? "text-income" : "text-expense")}>
        {value}
      </p>
    </div>
  );
}
