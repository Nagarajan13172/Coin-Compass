import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { compactNumber, formatMoney } from "@/lib/format";
import type { TrendDatum } from "@/lib/types";

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

export function TrendArea({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
          formatter={(value: number, name) => [formatMoney(value), name === "income" ? "Income" : "Expense"]}
        />
        <Area
          type="monotone"
          dataKey="income"
          stroke="hsl(var(--income))"
          strokeWidth={2}
          fill="url(#incomeFill)"
        />
        <Area
          type="monotone"
          dataKey="expense"
          stroke="hsl(var(--expense))"
          strokeWidth={2}
          fill="url(#expenseFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
