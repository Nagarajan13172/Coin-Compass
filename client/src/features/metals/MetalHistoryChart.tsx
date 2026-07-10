import { useId, useMemo } from "react";
import { useTranslation } from "react-i18next";
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
import { dateFnsLocale } from "@/lib/dates";
import type { Metal, MetalPrice } from "@/lib/types";
import { metalChartSeries, type GoldCity } from "./cities";

function dayLabel(d: string) {
  try {
    return format(parseISO(d), "dd MMM", { locale: dateFnsLocale() });
  } catch {
    return d;
  }
}

/**
 * Area chart of a metal's per-gram rate (INR) over the accumulated history.
 * Gold tracks the selected city's 22K counter rate — GRT's real rate on the days we
 * captured it, else spot + premium — so the chart agrees with the headline card.
 * Silver tracks its .999 (24K) per-gram rate.
 */
export function MetalHistoryChart({
  data,
  color = "#D4AF37",
  metal = "gold",
  city,
}: {
  data: MetalPrice[];
  color?: string;
  metal?: Metal;
  city?: GoldCity;
}) {
  const { t } = useTranslation("credits");
  const gradId = useId();
  const series = useMemo(() => metalChartSeries(data, metal, city), [data, metal, city]);
  const seriesLabel = metal === "gold" ? t("gold.seriesGold") : t("gold.seriesOther");
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
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
          formatter={(value: number) => [formatMoney(value, { currency: "INR" }), seriesLabel]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradId})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
