import { useId } from "react";
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
import type { MetalPrice } from "@/lib/types";

function dayLabel(d: string) {
  try {
    return format(parseISO(d), "dd MMM");
  } catch {
    return d;
  }
}

/** Area chart of a metal's 24k-per-gram rate (INR) over the accumulated history. */
export function MetalHistoryChart({
  data,
  color = "#D4AF37",
}: {
  data: MetalPrice[];
  color?: string;
}) {
  const gradId = useId();
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tickFormatter={dayLabel}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={28}
        />
        <YAxis
          tickFormatter={(v) => compactNumber(v)}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={52}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 12,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--popover))",
            color: "hsl(var(--popover-foreground))",
            fontSize: 12,
          }}
          labelFormatter={(l) => dayLabel(String(l))}
          formatter={(value: number) => [formatMoney(value, { currency: "INR" }), "24K / g"]}
        />
        <Area
          type="monotone"
          dataKey="pricePerGram24k"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
