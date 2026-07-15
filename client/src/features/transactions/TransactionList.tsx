import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { dateGroupLabel, dayKey } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { TransactionRow } from "./TransactionRow";
import { Separator } from "@/components/ui/separator";

interface TransactionListProps {
  transactions: Transaction[];
  /**
   * The current total balance across all accounts. When provided, each day shows
   * an "end-of-day balance" footer: we anchor at this present-day total (which
   * already reflects every transaction) and walk the newest-first list backwards,
   * subtracting each day's net. Transfers move money between accounts so they net
   * to zero on the total, which is why income − expense is the day's balance delta.
   *
   * Only pass this for the full, unfiltered ledger — any account/category/type/
   * tag/search filter makes the visible rows a subset that no longer reconciles
   * with the account balances, so the caller omits it then.
   */
  endingBalance?: number;
}

/** Transactions grouped by day with a per-day net total header. */
export function TransactionList({ transactions, endingBalance }: TransactionListProps) {
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

  // Balance at the end of each day, keyed by dayKey. Walk from the newest day
  // (whose end-of-day balance is the current total) back through history.
  const endOfDay = useMemo(() => {
    if (endingBalance == null) return null;
    const out = new Map<string, number>();
    let bal = endingBalance;
    for (const [key, g] of groups) {
      out.set(key, bal);
      bal -= g.income - g.expense; // step back to the prior day's closing balance
    }
    return out;
  }, [groups, endingBalance]);

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
            <div className="space-y-0.5">
              {group.items.map((t) => (
                <TransactionRow key={t._id} txn={t} showTime />
              ))}
            </div>
            {endOfDay && (
              <div className="mt-2 flex items-center justify-between border-t border-dashed border-border/60 px-1 pt-2">
                <span className="text-[11px] font-medium text-muted-foreground">
                  {t("group.endOfDayBalance")}
                </span>
                <span
                  className={`tnum text-xs font-semibold ${
                    (endOfDay.get(key) ?? 0) < 0 ? "text-expense" : "text-foreground"
                  }`}
                >
                  {formatMoney(endOfDay.get(key) ?? 0)}
                </span>
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
