import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { compactNumber, formatMoney } from "@/lib/format";
import type { TrendDatum } from "@/lib/types";

function labelFor(bucket: string) {
  try {
    if (/^\d{4}-\d{2}$/.test(bucket)) return format(parseISO(`${bucket}-01`), "MMM");
    if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return format(parseISO(bucket), "dd MMM");
  } catch {
    /* noop */
  }
  return bucket;
}

export function IncomeExpenseBar({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
        <XAxis
          dataKey="bucket"
          tickFormatter={labelFor}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          minTickGap={16}
        />
        <YAxis
          tickFormatter={(v) => compactNumber(v)}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          width={48}
        />
        <Tooltip
          cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
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
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v) => (
            <span className="text-xs text-muted-foreground">{v === "income" ? "Income" : "Expense"}</span>
          )}
        />
        <Bar name="income" dataKey="income" fill="hsl(var(--income))" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar name="expense" dataKey="expense" fill="hsl(var(--expense))" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
