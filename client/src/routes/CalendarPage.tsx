import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ArrowRight, ChevronLeft, ChevronRight, Plus, Repeat } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { dayKey, dateFnsLocale } from "@/lib/dates";
import { useTransactionList } from "@/hooks/useTransactions";
import { TransactionRow } from "@/features/transactions/TransactionRow";
import { useUIStore } from "@/stores/ui";
import type { RefLite, Transaction } from "@/lib/types";

function ref(v: RefLite | string | null | undefined): RefLite | null {
  return v && typeof v === "object" ? v : null;
}
function refId(v: RefLite | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v._id;
}
/** "+₹1,200" / "−₹640" with the app's minus glyph. */
function signed(n: number): string {
  return `${n >= 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`;
}

export default function CalendarPage() {
  const { t } = useTranslation("reports");
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState<Date>(new Date());
  const [accFilter, setAccFilter] = useState<string | null>(null);
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  // reset the in-day account filter whenever the day changes
  useEffect(() => setAccFilter(null), [selected]);

  const range = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    return { from: start.toISOString(), to: addDays(end, 1).toISOString(), start, end };
  }, [month]);

  const { data: txns, isLoading } = useTransactionList({ from: range.from, to: range.to });

  const byDay = useMemo(() => {
    const map = new Map<string, { income: number; expense: number; recurring: boolean }>();
    for (const t of txns ?? []) {
      const k = dayKey(t.date);
      if (!map.has(k)) map.set(k, { income: 0, expense: 0, recurring: false });
      const e = map.get(k)!;
      if (t.type === "income") e.income += t.amount;
      else if (t.type === "expense") e.expense += t.amount;
      if (t.recurring) e.recurring = true;
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

  // Income / expense / net for the selected day (transfers excluded from net).
  const summary = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of selectedTxns) {
      if (t.type === "income") income += t.amount;
      else if (t.type === "expense") expense += t.amount;
    }
    return { income, expense, net: income - expense };
  }, [selectedTxns]);

  // Per-account net movement for the day (transfers move money between two accounts).
  const dayAccounts = useMemo(() => {
    const map = new Map<string, { name: string; net: number }>();
    const add = (id: string | null, name: string | undefined, delta: number) => {
      if (!id) return;
      const e = map.get(id) ?? { name: name ?? t("account", { ns: "common" }), net: 0 };
      e.net += delta;
      map.set(id, e);
    };
    for (const t of selectedTxns) {
      const acc = ref(t.account);
      const to = ref(t.toAccount);
      if (t.type === "income") add(acc?._id ?? null, acc?.name, t.amount);
      else if (t.type === "expense") add(acc?._id ?? null, acc?.name, -t.amount);
      else {
        add(acc?._id ?? null, acc?.name, -t.amount);
        add(to?._id ?? null, to?.name, t.amount);
      }
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [selectedTxns, t]);

  const shownTxns = accFilter
    ? selectedTxns.filter((t) => refId(t.account) === accFilter || refId(t.toAccount) === accFilter)
    : selectedTxns;

  const dayHref = `/transactions?from=${encodeURIComponent(
    startOfDay(selected).toISOString()
  )}&to=${encodeURIComponent(startOfDay(addDays(selected, 1)).toISOString())}`;

  function addOnThisDay() {
    openTxnSheet({ prefill: { date: format(selected, "yyyy-MM-dd") } });
  }

  return (
    <div>
      <PageHeader title={t("calendar.title")} description={t("calendar.description")} />

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy", { locale: dateFnsLocale() })}</h2>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("calendar.prevMonth")}
                  onClick={() => setMonth((m) => addMonths(m, -1))}
                >
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMonth(startOfMonth(new Date()))}>
                  {t("date.today", { ns: "common" })}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("calendar.nextMonth")}
                  onClick={() => setMonth((m) => addMonths(m, 1))}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, i) =>
                format(addDays(range.start, i), "EEE", { locale: dateFnsLocale() })
              ).map((w) => (
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
                        aria-label={format(d, "EEEE, dd MMM yyyy", { locale: dateFnsLocale() })}
                        aria-pressed={isSel}
                        className={cn(
                          "relative flex h-16 flex-col items-stretch rounded-lg border p-1 text-left transition-colors",
                          inMonth ? "hover:bg-accent" : "opacity-40",
                          isSel ? "border-primary ring-1 ring-primary" : "border-transparent"
                        )}
                      >
                        {stats?.recurring && (
                          <Repeat
                            className="absolute left-1 top-1 h-3 w-3 text-muted-foreground"
                            aria-label={t("calendar.hasRecurring")}
                          />
                        )}
                        <span
                          className={cn(
                            "tnum self-end text-xs",
                            isToday &&
                              "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
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
          <CardContent className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{format(selected, "EEEE, dd MMM yyyy", { locale: dateFnsLocale() })}</h3>
              {isSameDay(selected, new Date()) && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {t("date.today", { ns: "common" })}
                </span>
              )}
            </div>

            {/* summary block */}
            <div className="grid grid-cols-3 divide-x rounded-lg border text-center">
              <div className="px-2 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t("inLabel")}</p>
                <p className="tnum text-sm font-semibold text-income">+{formatMoney(summary.income)}</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t("outLabel")}</p>
                <p className="tnum text-sm font-semibold text-expense">−{formatMoney(summary.expense)}</p>
              </div>
              <div className="px-2 py-2.5">
                <p className="text-[11px] text-muted-foreground">{t("net")}</p>
                <p
                  className={cn(
                    "tnum text-sm font-semibold",
                    summary.net >= 0 ? "text-income" : "text-expense"
                  )}
                >
                  {signed(summary.net)}
                </p>
              </div>
            </div>

            {/* per-account breakdown — chips also filter the list below */}
            {dayAccounts.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("byAccount")}</p>
                <div className="flex flex-wrap gap-1.5">
                  {dayAccounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setAccFilter((prev) => (prev === a.id ? null : a.id))}
                      aria-pressed={accFilter === a.id}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                        accFilter === a.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "hover:bg-accent"
                      )}
                    >
                      <span className="font-medium">{a.name}</span>
                      <span className={cn("tnum", a.net >= 0 ? "text-income" : "text-expense")}>
                        {signed(a.net)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* transactions */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold">
                  {t("calendar.transactions")}
                  {shownTxns.length > 0 && (
                    <span className="ml-1 font-normal text-muted-foreground">({shownTxns.length})</span>
                  )}
                </h4>
                {accFilter && (
                  <button
                    type="button"
                    onClick={() => setAccFilter(null)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("calendar.clearFilter")}
                  </button>
                )}
              </div>
              {shownTxns.length ? (
                <div className="space-y-0.5">
                  {shownTxns.map((t) => (
                    <TransactionRow key={t._id} txn={t} />
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("calendar.noTxnsOnDay")}
                </p>
              )}
            </div>

            {/* actions */}
            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" onClick={addOnThisDay}>
                <Plus /> {t("calendar.addOnThisDay")}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link to={dayHref}>
                  {t("calendar.viewInTransactions")} <ArrowRight />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
