import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { format, parseISO } from "date-fns";
import { Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { dateFnsLocale } from "@/lib/dates";
import { useMetalHistory, useMetalsLatest } from "@/hooks/useMetals";
import { METAL_META } from "./meta";
import { MetalChange } from "./MetalChange";
import {
  DEFAULT_CITY,
  findCity,
  metalChartSeries,
  resolveCityRate,
  type MetalSeriesPoint,
} from "./cities";

function asOf(date: string) {
  try {
    return format(parseISO(date), "dd MMM", { locale: dateFnsLocale() });
  } catch {
    return date;
  }
}

function SparkTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: MetalSeriesPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="tnum font-semibold">{formatMoney(p.value, { currency: "INR" })}</p>
      <p className="text-muted-foreground">{asOf(p.date)}</p>
    </div>
  );
}

function Sparkline({ data, color }: { data: MetalSeriesPoint[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="goldSpark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Tooltip
          content={<SparkTooltip />}
          cursor={{ stroke: color, strokeOpacity: 0.35, strokeDasharray: "3 3" }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.75}
          fill="url(#goldSpark)"
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * Compact dashboard widget: today's gold (24k/22k per gram) with a 30-day
 * sparkline, plus a silver line. Renders nothing until the feature is
 * configured and at least one snapshot exists.
 */
export function GoldRateCard() {
  const { t } = useTranslation("credits");
  const { data: latest } = useMetalsLatest();
  const gold = latest?.gold;
  const silver = latest?.silver;
  // Only fetch the sparkline once we know the feature is on and has data.
  const { data: history } = useMetalHistory("gold", 30, Boolean(latest?.configured && gold));

  if (!latest?.configured || !gold) return null;

  const city = findCity(DEFAULT_CITY);
  const rate = resolveCityRate(gold, city);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4" style={{ color: METAL_META.gold.color }} /> {t("gold.title")}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/gold">{t("gold.view")}</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">
              {t("gold.cardHeadline", { city: city.label })}
            </p>
            <p className="tnum text-2xl font-bold">
              {formatMoney(rate.gram22k, { currency: "INR" })}
            </p>
            <p className="tnum text-xs text-muted-foreground">
              {rate.approx
                ? t("gold.spot22kCard", { value: formatMoney(gold.pricePerGram22k, { currency: "INR" }) })
                : rate.source}
            </p>
          </div>
          <div className="text-right">
            <MetalChange changePct={gold.changePct} />
            <p className="mt-1 text-[11px] text-muted-foreground">{t("gold.asOfLower", { date: asOf(gold.date) })}</p>
          </div>
        </div>

        {history && history.length > 1 && (
          <Sparkline data={metalChartSeries(history, "gold", city)} color={METAL_META.gold.color} />
        )}

        {silver && (
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">{t("gold.silverLine")}</span>
            <span className="flex items-center gap-2">
              <span className="tnum text-sm font-semibold">
                {formatMoney(silver.pricePerGram24k, { currency: "INR" })}
              </span>
              <MetalChange changePct={silver.changePct} />
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
