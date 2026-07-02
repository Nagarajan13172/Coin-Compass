import { useState } from "react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { Coins, RefreshCw, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useMetalHistory, useMetalsLatest, useRefreshMetals } from "@/hooks/useMetals";
import type { Metal, MetalPrice } from "@/lib/types";
import { METAL_META } from "@/features/metals/meta";
import { MetalChange } from "@/features/metals/MetalChange";
import { MetalHistoryChart } from "@/features/metals/MetalHistoryChart";
import {
  DEFAULT_CITY,
  findCity,
  GOLD_CITIES,
  resolveCityRate,
  type GoldCity,
} from "@/features/metals/cities";

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
  // For gold, headline the selected city's 22K rate — GRT's actual counter rate
  // when we have it, else spot + premium. Spot values stay below as reference.
  const resolved = isGold && city ? resolveCityRate(price, city) : null;
  const headline = resolved ? resolved.gram22k : price.pricePerGram24k;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4" style={{ color: meta.color }} /> {meta.label}
          {resolved && city && (
            <Badge variant="secondary" className="font-normal">
              {city.label} · {resolved.approx ? "approx" : "GRT"}
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
          {resolved && city && (
            <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
              {resolved.approx
                ? `≈ spot 22K ${formatMoney(price.pricePerGram22k, { currency: "INR" })} · +${city.premiumPct}% (duty, GST, margin)`
                : `${resolved.source} · spot 22K ${formatMoney(price.pricePerGram22k, { currency: "INR" })}`}
            </p>
          )}
        </div>
        {isGold && resolved && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="24K / gram" value={resolved.gram24k} />
            <Stat label="18K / gram" value={resolved.gram18k} />
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
  const refresh = useRefreshMetals();

  async function refreshNow() {
    try {
      await refresh.mutateAsync();
      toast.success("Rates refreshed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't refresh rates");
    }
  }

  return (
    <div>
      <PageHeader
        title="Gold & Silver"
        description="Live precious-metal rates in ₹ · auto-refreshed daily, or refresh now"
        actions={
          <div className="flex items-center gap-2">
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
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh rates now"
              onClick={refreshNow}
              disabled={refresh.isPending}
            >
              <RefreshCw className={cn("h-4 w-4", refresh.isPending && "animate-spin")} />
            </Button>
          </div>
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
            Spot from goldapi.io (international spot × ₹). Chennai shows GRT Jewellers’ published
            counter rate (from grtjewels.com); other cities estimate spot + a local premium (duty,
            GST &amp; margin) and exclude making charges. Refreshed automatically once a day, or
            on demand with the refresh button above (max once every 15 minutes).
          </p>
        </div>
      )}
    </div>
  );
}
