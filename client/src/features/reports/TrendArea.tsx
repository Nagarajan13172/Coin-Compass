import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { compactNumber, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TrendDatum } from "@/lib/types";

const SERIES_LABEL: Record<string, string> = { income: "Income", expense: "Expense" };

function labelFor(bucket: string) {
  // bucket is YYYY-MM-DD or YYYY-MM
  try {
    if (/^\d{4}-\d{2}$/.test(bucket)) return format(parseISO(`${bucket}-01`), "MMM");
    if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return format(parseISO(bucket), "dd MMM");
  } catch {
    /* noop */
  }
  return bucket;
}

/**
 * Income vs expense areas over time. Clicking a bucket calls `onSelect(bucket)`
 * (deep-link to that period's transactions); clicking a legend entry toggles
 * that series on/off.
 */
export function TrendArea({
  data,
  onSelect,
}: {
  data: TrendDatum[];
  onSelect?: (bucket: string) => void;
}) {
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart
        data={data}
        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
        className={cn(onSelect && "cursor-pointer")}
        onClick={
          onSelect
            ? (state) => {
                if (state?.activeLabel) onSelect(String(state.activeLabel));
              }
            : undefined
        }
      >
        <defs>
          <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--income))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--income))" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(var(--expense))" stopOpacity={0.35} />
            <stop offset="95%" stopColor="hsl(var(--expense))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="bucket"
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
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          labelFormatter={(l) => labelFor(String(l))}
          formatter={(value: number, name) => [formatMoney(value), SERIES_LABEL[String(name)] ?? name]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          onClick={(o) => toggle(String(o.dataKey))}
          formatter={(value, entry) => {
            const key = String((entry as { dataKey?: string })?.dataKey ?? value);
            return (
              <span
                className={cn(
                  "cursor-pointer select-none text-xs text-muted-foreground",
                  hidden[key] && "text-muted-foreground/50 line-through"
                )}
              >
                {SERIES_LABEL[String(value)] ?? value}
              </span>
            );
          }}
        />
        <Area
          type="monotone"
          name="income"
          dataKey="income"
          hide={hidden.income}
          stroke="hsl(var(--income))"
          strokeWidth={2}
          fill="url(#incomeFill)"
        />
        <Area
          type="monotone"
          name="expense"
          dataKey="expense"
          hide={hidden.expense}
          stroke="hsl(var(--expense))"
          strokeWidth={2}
          fill="url(#expenseFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
