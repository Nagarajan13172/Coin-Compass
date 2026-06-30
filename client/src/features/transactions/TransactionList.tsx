import { useMemo } from "react";
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
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; items: Transaction[]; net: number }>();
    for (const t of transactions) {
      const key = dayKey(t.date);
      if (!map.has(key)) map.set(key, { label: dateGroupLabel(t.date), items: [], net: 0 });
      const g = map.get(key)!;
      g.items.push(t);
      g.net += t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0;
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [transactions]);

  return (
    <div className="space-y-5">
      {groups.map(([key, group], gi) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(gi * 0.03, 0.2) }}
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}
            </span>
            <span
              className={`tnum text-xs font-medium ${
                group.net >= 0 ? "text-income" : "text-expense"
              }`}
            >
              {group.net >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(group.net))}
            </span>
          </div>
          <Separator className="mb-1" />
          <div className="space-y-0.5">
            {group.items.map((t) => (
              <TransactionRow key={t._id} txn={t} />
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
