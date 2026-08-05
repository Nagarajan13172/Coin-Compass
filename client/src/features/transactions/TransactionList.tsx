import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { dateGroupLabel, dayKey } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { dayEndBalances, type DayBalance, type LedgerSnapshot } from "@/lib/dayBalances";
import { groupBySplit } from "@/lib/splits";
import type { Transaction } from "@/lib/types";
import { TransactionRow } from "./TransactionRow";
import { SplitRow } from "@/features/splits/SplitRow";
import { Separator } from "@/components/ui/separator";

interface TransactionListProps {
  transactions: Transaction[];
  /**
   * Turns on the per-day "end of day" footer, which lists every account the day
   * touched with that account's own closing balance (see dayEndBalances). Omit
   * it to hide the footer — the caller does that whenever a category/type/tag/
   * search filter makes the visible rows a subset that can't reconcile.
   */
  dayBalances?: {
    /** Per-account + total balances as of the window's end, the walk-back anchor. */
    snapshot: LedgerSnapshot;
    /** Limit the lines to these accounts (set under an account filter). */
    restrictTo?: readonly string[];
    /** Whether a portfolio total row can be trusted (false under any filter). */
    includeTotal: boolean;
  };
}

/** Transactions grouped by day with a per-day net total header. */
export function TransactionList({ transactions, dayBalances }: TransactionListProps) {
  const { t } = useTranslation("transactions");
  const groups = useMemo(() => {
    type Group = {
      label: string;
      items: Transaction[];
      income: number;
      expense: number;
      transfers: number;
    };
    const map = new Map<string, Group>();
    for (const t of transactions) {
      const key = dayKey(t.date);
      if (!map.has(key))
        map.set(key, { label: dateGroupLabel(t.date), items: [], income: 0, expense: 0, transfers: 0 });
      const g = map.get(key)!;
      g.items.push(t);
      if (t.type === "income") g.income += t.amount;
      else if (t.type === "expense") g.expense += t.amount;
      else g.transfers += 1;
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions]);

  // Per-account closing balances for each day, keyed by dayKey.
  const endOfDay = useMemo(() => {
    if (!dayBalances) return null;
    return dayEndBalances(
      groups.map(([key, g]) => ({ key, items: g.items })),
      dayBalances.snapshot,
      { restrictTo: dayBalances.restrictTo, includeTotal: dayBalances.includeTotal }
    );
  }, [groups, dayBalances]);

  return (
    <div className="space-y-7">
      {groups.map(([key, group], gi) => {
        const net = group.income - group.expense;
        const hasFlow = group.income > 0 || group.expense > 0;
        const mixed = group.income > 0 && group.expense > 0;
        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(gi * 0.03, 0.2) }}
          >
            <div className="flex items-end justify-between gap-3 px-1 pb-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{group.label}</p>
                {(mixed || group.transfers > 0) && (
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tnum text-muted-foreground">
                    {group.income > 0 && (
                      <span className="text-income">{t("group.in", { amount: formatMoney(group.income) })}</span>
                    )}
                    {group.expense > 0 && (
                      <span className="text-expense">{t("group.out", { amount: formatMoney(group.expense) })}</span>
                    )}
                    {group.transfers > 0 && (
                      <span>{t("group.transfers", { count: group.transfers })}</span>
                    )}
                  </p>
                )}
              </div>
              {hasFlow && (
                <span
                  className={`tnum shrink-0 text-sm font-semibold ${net >= 0 ? "text-income" : "text-expense"}`}
                >
                  {t("group.net")} {net >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(net))}
                </span>
              )}
            </div>
            <Separator className="mb-1.5" />
            {/* Every leg of a shared bill collapses into one SplitRow, so a
                six-way dinner doesn't bury the rest of the day. */}
            <div className="space-y-0.5">
              {groupBySplit(group.items).map((entry) =>
                entry.kind === "split" ? (
                  <SplitRow key={entry.splitId} splitId={entry.splitId} legs={entry.legs} />
                ) : (
                  <TransactionRow key={entry.txn._id} txn={entry.txn} showTime />
                )
              )}
            </div>
            <DayBalanceFooter day={endOfDay?.get(key)} />
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Where the day left each account it touched, plus the portfolio total when the
 * view reconciles. Per-account rather than one blended figure so that spending
 * from two accounts reads as two closing balances, and so a credit shows both
 * legs — the bank the money left and the receivable it became. Renders nothing
 * when the caller didn't ask for balances.
 */
function DayBalanceFooter({ day }: { day?: DayBalance }) {
  const { t } = useTranslation("transactions");
  if (!day || (!day.accounts.length && day.total == null)) return null;

  return (
    <div className="mt-2 border-t border-dashed border-border/60 px-1 pt-2">
      <p className="text-[11px] font-medium text-muted-foreground">{t("group.endOfDay")}</p>
      <div className="mt-1 space-y-0.5">
        {day.accounts.map((a) => (
          <div key={a.accountId} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${a.color ? "" : "bg-muted-foreground/40"}`}
                style={a.color ? { backgroundColor: a.color } : undefined}
              />
              <span className="truncate text-[11px] text-muted-foreground">
                {a.name || t("group.unnamedAccount")}
              </span>
              {a.delta !== 0 && (
                <span
                  className={`tnum shrink-0 text-[10px] ${a.delta > 0 ? "text-income" : "text-expense"}`}
                >
                  {formatMoney(a.delta, { signed: true })}
                </span>
              )}
            </span>
            <span
              className={`tnum shrink-0 text-xs font-semibold ${
                a.balance < 0 ? "text-expense" : "text-foreground"
              }`}
            >
              {formatMoney(a.balance)}
            </span>
          </div>
        ))}
      </div>
      {day.total != null && (
        <div
          className={`flex items-center justify-between gap-2 ${
            day.accounts.length ? "mt-1.5 border-t border-border/40 pt-1.5" : "mt-1"
          }`}
        >
          <span className="text-[11px] font-medium text-muted-foreground">{t("group.total")}</span>
          <span
            className={`tnum text-xs font-semibold ${
              day.total < 0 ? "text-expense" : "text-foreground"
            }`}
          >
            {formatMoney(day.total)}
          </span>
        </div>
      )}
    </div>
  );
}
