import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { Coins } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { useMetalHistory, useMetalsLatest } from "@/hooks/useMetals";
import type { MetalPrice } from "@/lib/types";
import { METAL_META } from "./meta";
import { MetalChange } from "./MetalChange";

function asOf(date: string) {
  try {
    return format(parseISO(date), "dd MMM");
  } catch {
    return date;
  }
}

function Sparkline({ data, color }: { data: MetalPrice[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="goldSpark" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="pricePerGram24k"
          stroke={color}
          strokeWidth={1.75}
          fill="url(#goldSpark)"
          isAnimationActive={false}
          dot={false}
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
  const { data: latest } = useMetalsLatest();
  const { data: history } = useMetalHistory("gold", 30);

  const gold = latest?.gold;
  const silver = latest?.silver;
  if (!latest?.configured || !gold) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4" style={{ color: METAL_META.gold.color }} /> Gold &amp; Silver
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/gold">View</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Gold · 24K / gram</p>
            <p className="tnum text-2xl font-bold">
              {formatMoney(gold.pricePerGram24k, { currency: "INR" })}
            </p>
            <p className="tnum text-xs text-muted-foreground">
              22K {formatMoney(gold.pricePerGram22k, { currency: "INR" })}
            </p>
          </div>
          <div className="text-right">
            <MetalChange changePct={gold.changePct} />
            <p className="mt-1 text-[11px] text-muted-foreground">as of {asOf(gold.date)}</p>
          </div>
        </div>

        {history && history.length > 1 && (
          <Sparkline data={history} color={METAL_META.gold.color} />
        )}

        {silver && (
          <div className="flex items-center justify-between border-t pt-3">
            <span className="text-sm text-muted-foreground">Silver · / gram</span>
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
