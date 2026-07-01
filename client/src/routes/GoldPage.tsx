import { useState } from "react";
import { format, parseISO } from "date-fns";
import { Coins, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { formatMoney } from "@/lib/format";
import { useMetalHistory, useMetalsLatest } from "@/hooks/useMetals";
import type { Metal, MetalPrice } from "@/lib/types";
import { METAL_META } from "@/features/metals/meta";
import { MetalChange } from "@/features/metals/MetalChange";
import { MetalHistoryChart } from "@/features/metals/MetalHistoryChart";
import { DEFAULT_CITY, findCity, GOLD_CITIES, localRate, type GoldCity } from "@/features/metals/cities";

/** Today's date (YYYY-MM-DD) in IST, to detect a stale (weekend/holiday) rate. */
function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function asOf(date: string) {
  try {
    return format(parseISO(date), "dd MMM yyyy");
  } catch {
    return date;
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="tnum text-sm font-semibold">{formatMoney(value, { currency: "INR" })}</p>
    </div>
  );
}

function MetalBigCard({ price, metal, city }: { price: MetalPrice; metal: Metal; city?: GoldCity }) {
  const meta = METAL_META[metal];
  const stale = price.date !== istToday();
  const isGold = metal === "gold";
  // For gold, headline the selected city's approximate local 22K rate; keep the
  // exact international spot values below as the honest reference.
  const headline = isGold && city ? localRate(price.pricePerGram22k, city.premiumPct) : price.pricePerGram24k;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4" style={{ color: meta.color }} /> {meta.label}
          {isGold && city && (
            <Badge variant="secondary" className="font-normal">
              {city.label} · approx
            </Badge>
          )}
        </CardTitle>
        <MetalChange changePct={price.changePct} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{isGold ? "22K / gram" : "24K / gram"}</p>
          <p className="tnum text-3xl font-extrabold tracking-tight">
            {formatMoney(headline, { currency: "INR" })}
          </p>
          {isGold && city && (
            <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
              Spot 22K {formatMoney(price.pricePerGram22k, { currency: "INR" })} · +{city.premiumPct}% est. (duty, GST, margin)
            </p>
          )}
        </div>
        {isGold && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="24K / gram (spot)" value={price.pricePerGram24k} />
            <Stat label="18K / gram (spot)" value={price.pricePerGram18k} />
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="tnum">
            Spot {formatMoney(price.pricePerOunce, { currency: "INR", compact: true })}/oz
          </span>
          <span>{stale ? `Last close · ${asOf(price.date)}` : `As of ${asOf(price.date)}`}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GoldPage() {
  const [metal, setMetal] = useState<Metal>("gold");
  const [days, setDays] = useState(90);
  const [cityKey, setCityKey] = useState(DEFAULT_CITY);
  const city = findCity(cityKey);
  const { data: latest, isLoading } = useMetalsLatest();
  const { data: history } = useMetalHistory(metal, days);

  return (
    <div>
      <PageHeader
        title="Gold & Silver"
        description="Live precious-metal rates in ₹ · updated once daily"
        actions={
          <Select value={cityKey} onValueChange={setCityKey}>
            <SelectTrigger className="w-40" aria-label="City">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GOLD_CITIES.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : !latest?.configured ? (
        <EmptyState
          icon={Coins}
          title="Gold tracking isn’t set up yet"
          description="Add a free GOLD_API_KEY (from goldapi.io) to the server environment to enable daily gold & silver rates."
        />
      ) : !latest.gold && !latest.silver ? (
        <EmptyState
          icon={TrendingUp}
          title="No rates yet"
          description="The first snapshot will appear after the next daily fetch. Check back shortly."
        />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            {latest.gold && <MetalBigCard price={latest.gold} metal="gold" city={city} />}
            {latest.silver && <MetalBigCard price={latest.silver} metal="silver" />}
          </div>

          <Card>
            <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Price history</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={metal} onValueChange={(v) => setMetal(v as Metal)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="gold">Gold</TabsTrigger>
                    <TabsTrigger value="silver">Silver</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                  <TabsList className="h-8">
                    <TabsTrigger value="7">7D</TabsTrigger>
                    <TabsTrigger value="30">30D</TabsTrigger>
                    <TabsTrigger value="90">90D</TabsTrigger>
                    <TabsTrigger value="365">1Y</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {history && history.length > 1 ? (
                <MetalHistoryChart data={history} color={METAL_META[metal].color} metal={metal} />
              ) : (
                <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
                  <TrendingUp className="h-6 w-6" />
                  <p>History is still building.</p>
                  <p className="text-xs">
                    A new data point is added each day — check back tomorrow.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground">
            Spot rates sourced from goldapi.io (international spot × ₹), refreshed daily. City
            figures add an estimated local premium (import duty, GST &amp; dealer margin) over spot
            and exclude making charges — indicative, not a live counter quote.
          </p>
        </div>
      )}
    </div>
  );
}
