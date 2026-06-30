import { useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { dayKey } from "@/lib/dates";
import { useTransactionList } from "@/hooks/useTransactions";
import { TransactionList } from "@/features/transactions/TransactionList";
import type { Transaction } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function CalendarPage() {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(new Date());

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return { from: start.toISOString(), to: addDays(end, 1).toISOString(), start, end };
  }, [month]);

  const { data: txns, isLoading } = useTransactionList({ from: range.from, to: range.to });

  const byDay = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of txns ?? []) {
      const k = dayKey(t.date);
      if (!map.has(k)) map.set(k, { income: 0, expense: 0 });
      const e = map.get(k)!;
      if (t.type === "income") e.income += t.amount;
      else if (t.type === "expense") e.expense += t.amount;
    }
    return map;
  }, [txns]);

  const days = useMemo(() => {
    const out: Date[] = [];
    let d = range.start;
    while (d <= range.end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }, [range]);

  const selectedTxns: Transaction[] = useMemo(
    () => (txns ?? []).filter((t) => isSameDay(new Date(t.date), selected)),
    [txns, selected]
  );

  return (
    <div>
      <PageHeader title="Calendar" description="Spending day by day" />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h2>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, -1))}>
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
                  Today
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setMonth((m) => addMonths(m, 1))}>
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((w) => (
                <div key={w} className="pb-1 text-center text-xs font-medium text-muted-foreground">
                  {w}
                </div>
              ))}
              {isLoading
                ? Array.from({ length: 35 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))
                : days.map((d) => {
                    const k = dayKey(d.toISOString());
                    const stats = byDay.get(k);
                    const inMonth = isSameMonth(d, month);
                    const isSel = isSameDay(d, selected);
                    const isToday = isSameDay(d, new Date());
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setSelected(d)}
                        className={cn(
                          "flex h-16 flex-col items-stretch rounded-lg border p-1 text-left transition-colors",
                          inMonth ? "hover:bg-accent" : "opacity-40",
                          isSel ? "border-primary ring-1 ring-primary" : "border-transparent"
                        )}
                      >
                        <span
                          className={cn(
                            "tnum self-end text-xs",
                            isToday && "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                          )}
                        >
                          {format(d, "d")}
                        </span>
                        <span className="mt-auto space-y-0.5">
                          {stats?.income ? (
                            <span className="tnum block truncate text-[10px] font-medium text-income">
                              +{formatMoney(stats.income, { compact: true })}
                            </span>
                          ) : null}
                          {stats?.expense ? (
                            <span className="tnum block truncate text-[10px] font-medium text-expense">
                              −{formatMoney(stats.expense, { compact: true })}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h3 className="mb-3 font-semibold">{format(selected, "EEEE, dd MMM yyyy")}</h3>
            {selectedTxns.length ? (
              <TransactionList transactions={selectedTxns} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No transactions on this day
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
