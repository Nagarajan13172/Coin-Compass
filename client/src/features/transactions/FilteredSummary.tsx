import { useTranslation } from "react-i18next";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TxnSummary } from "@/hooks/useTransactions";

/**
 * In / out / net totals for whatever the transaction list is currently filtered
 * to. Shown in place of the whole-ledger MonthSummaryRail when a narrowing filter
 * is active (that rail is built on /reports, which can't honour those filters).
 *
 * Two variants:
 *  - `strip` — a slim horizontal bar above the list, for narrow screens where the
 *    right rail is hidden.
 *  - `card`  — the richer right-column card on wide screens.
 */
export function FilteredSummary({
  summary,
  label,
  loading,
  variant,
}: {
  summary?: TxnSummary;
  label: string;
  loading?: boolean;
  variant: "strip" | "card";
}) {
  const { t } = useTranslation("transactions");
  const income = summary?.income ?? 0;
  const expense = summary?.expense ?? 0;
  const net = summary?.net ?? 0;
  const count = summary?.count ?? 0;
  const netTone = net >= 0 ? "income" : "expense";
  const netText = `${net >= 0 ? "+" : "−"}${formatMoney(Math.abs(net))}`;

  if (variant === "strip") {
    return (
      <Card className="mb-3">
        <CardContent className="p-3">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="truncate text-xs font-medium text-foreground">
              {t("filteredSummary.title")}
            </p>
            <p className="shrink-0 text-[11px] text-muted-foreground">
              {label} · {t("filteredSummary.count", { count })}
            </p>
          </div>
          {loading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Metric label={t("summaryRail.in")} value={formatMoney(income)} tone="income" />
              <Metric label={t("summaryRail.out")} value={formatMoney(expense)} tone="expense" />
              <Metric label={t("summaryRail.net")} value={netText} tone={netTone} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="sticky top-4 space-y-3">
      <div className="px-1">
        <p className="text-sm font-semibold text-foreground">{t("filteredSummary.title")}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <>
              {/* net for the filtered set */}
              <div>
                <p className="text-xs text-muted-foreground">{t("summaryRail.net")}</p>
                <p
                  className={cn(
                    "tnum text-2xl font-bold tracking-tight",
                    net >= 0 ? "text-income" : "text-expense"
                  )}
                >
                  {netText}
                </p>
              </div>

              {/* in / out */}
              <div className="grid grid-cols-2 gap-2">
                <Stat
                  icon={<ArrowDownLeft className="h-3.5 w-3.5" />}
                  tone="income"
                  label={t("summaryRail.in")}
                  value={formatMoney(income)}
                />
                <Stat
                  icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                  tone="expense"
                  label={t("summaryRail.out")}
                  value={formatMoney(expense)}
                />
              </div>

              <p className="border-t pt-3 text-center text-xs text-muted-foreground">
                {t("filteredSummary.count", { count })}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Compact label-over-value cell for the horizontal strip. */
function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "expense";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum truncate text-sm font-semibold",
          tone === "income" ? "text-income" : "text-expense"
        )}
      >
        {value}
      </p>
    </div>
  );
}

/** Bordered icon tile for the wide-screen card (mirrors the MonthSummaryRail Stat). */
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
      <p
        className={cn(
          "tnum truncate text-sm font-semibold",
          tone === "income" ? "text-income" : "text-expense"
        )}
      >
        {value}
      </p>
    </div>
  );
}
