import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { compactNumber, formatMoney } from "@/lib/format";
import { dateFnsLocale } from "@/lib/dates";
import type { NetWorthSnapshot } from "@/lib/types";

type Range = "1m" | "3m" | "1y" | "all";
const RANGE_DAYS: Record<Range, number> = { "1m": 30, "3m": 90, "1y": 365, all: Infinity };

function labelFor(date: string) {
  try {
    return format(parseISO(date), "dd MMM", { locale: dateFnsLocale() });
  } catch {
    return date;
  }
}

export function NetWorthTrend({ data, loading }: { data: NetWorthSnapshot[] | undefined; loading: boolean }) {
  const { t } = useTranslation("wealth");
  const [range, setRange] = useState<Range>("3m");

  const points = useMemo(() => {
    const all = data ?? [];
    if (!all.length) return [];
    const days = RANGE_DAYS[range];
    if (!isFinite(days)) return all;
    const cutoff = subDays(parseISO(all[all.length - 1].date), days);
    return all.filter((p) => parseISO(p.date) >= cutoff);
  }, [data, range]);

  if (loading) return <Skeleton className="h-72 w-full rounded-xl" />;

  const latest = data?.[data.length - 1];
  const first = points[0];
  const delta = latest && first ? latest.netWorth - first.netWorth : 0;
  const pct = first && first.netWorth !== 0 ? Math.round((delta / Math.abs(first.netWorth)) * 100) : null;
  const up = delta >= 0;
  const negative = (latest?.netWorth ?? 0) < 0;
  // Colour the series by the current state: red when in the red, green otherwise.
  const stroke = negative ? "hsl(var(--expense))" : "hsl(var(--income))";
  const fillId = negative ? "nwFillNeg" : "nwFillPos";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle as="h2">{t("trend.title")}</CardTitle>
          {latest && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              <span className={`tnum font-semibold ${negative ? "text-expense" : "text-income"}`}>
                {formatMoney(latest.netWorth)}
              </span>
              {points.length >= 2 && (
                <span className={`tnum inline-flex items-center gap-0.5 ${up ? "text-income" : "text-expense"}`}>
                  {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {formatMoney(Math.abs(delta), { compact: Math.abs(delta) > 99999 })}
                  {pct != null ? ` (${up ? "+" : "−"}${Math.abs(pct)}%)` : ""}
                </span>
              )}
            </p>
          )}
        </div>
        <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
          <TabsList className="h-8">
            <TabsTrigger value="1m" className="text-xs">{t("trend.range1m")}</TabsTrigger>
            <TabsTrigger value="3m" className="text-xs">{t("trend.range3m")}</TabsTrigger>
            <TabsTrigger value="1y" className="text-xs">{t("trend.range1y")}</TabsTrigger>
            <TabsTrigger value="all" className="text-xs">{t("trend.rangeAll")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {points.length >= 2 ? (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="nwFillPos" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--income))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--income))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="nwFillNeg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--expense))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--expense))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                tickFormatter={labelFor}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(v) => compactNumber(v)}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={48}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--popover))",
                  color: "hsl(var(--popover-foreground))",
                  fontSize: 12,
                }}
                labelFormatter={(l) => labelFor(String(l))}
                formatter={(value: number) => [formatMoney(value), t("trend.seriesName")]}
              />
              <Area type="monotone" dataKey="netWorth" stroke={stroke} strokeWidth={2} fill={`url(#${fillId})`} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-60 flex-col items-center justify-center gap-2 text-center">
            <div className="rounded-full bg-secondary p-3">
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">{t("trend.emptyTitle")}</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {t("trend.emptyDesc")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
