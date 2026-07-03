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
}

/** Transactions grouped by day with a per-day net total header. */
export function TransactionList({ transactions }: TransactionListProps) {
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
                <TransactionRow key={t._id} txn={t} />
              ))}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
