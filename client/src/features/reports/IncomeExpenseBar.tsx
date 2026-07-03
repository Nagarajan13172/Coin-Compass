import { useState } from "react";
import { useTranslation } from "react-i18next";
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
import { dateFnsLocale } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { TrendDatum } from "@/lib/types";

function labelFor(bucket: string) {
  try {
    if (/^\d{4}-\d{2}$/.test(bucket)) return format(parseISO(`${bucket}-01`), "MMM", { locale: dateFnsLocale() });
    if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return format(parseISO(bucket), "dd MMM", { locale: dateFnsLocale() });
  } catch {
    /* noop */
  }
  return bucket;
}

/**
 * Grouped income vs expense bars. Clicking a bucket calls `onSelect(bucket)`
 * (deep-link to that period's transactions); clicking a legend entry toggles
 * that series on/off.
 */
export function IncomeExpenseBar({
  data,
  onSelect,
}: {
  data: TrendDatum[];
  onSelect?: (bucket: string) => void;
}) {
  const { t } = useTranslation("common");
  const seriesLabel = (key: string) => t(`txnType.${key}`, { defaultValue: key });
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setHidden((h) => ({ ...h, [key]: !h[key] }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart
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
          formatter={(value: number, name) => [formatMoney(value), seriesLabel(String(name))]}
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
                {seriesLabel(String(value))}
              </span>
            );
          }}
        />
        <Bar
          name="income"
          dataKey="income"
          hide={hidden.income}
          fill="hsl(var(--income))"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          name="expense"
          dataKey="expense"
          hide={hidden.expense}
          fill="hsl(var(--expense))"
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
