import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  BarChart3,
  Coins,
  LineChart as LineChartIcon,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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
import { dateFnsLocale } from "@/lib/dates";
import { useMetalHistory, useMetalsLatest, useRefreshMetals } from "@/hooks/useMetals";
import type { Metal, MetalPrice } from "@/lib/types";
import { METAL_META } from "@/features/metals/meta";
import { MetalChange } from "@/features/metals/MetalChange";
import { MetalHistoryChart } from "@/features/metals/MetalHistoryChart";
import { JewelleryCalculator } from "@/features/metals/JewelleryCalculator";
import { averagesFor, buySignal, movingAverage } from "@/features/metals/buySignal";
import { BuySignalBanner } from "@/features/metals/BuySignalBanner";
import { metalChartSeries } from "@/features/metals/cities";
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
    return format(parseISO(date), "dd MMM yyyy", { locale: dateFnsLocale() });
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
  const { t } = useTranslation("credits");
  const meta = METAL_META[metal];
  const stale = price.date !== istToday();
  const isGold = metal === "gold";
  // For gold, headline the selected city's 22K rate — GRT's actual counter rate
  // when we have it, else spot + premium. Spot values stay below as reference.
  const resolved = isGold && city ? resolveCityRate(price, city) : null;
  const headline = resolved ? resolved.gram22k : price.pricePerGram24k;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <Coins className="h-4 w-4" style={{ color: meta.color }} /> {t(`gold.metal.${metal}`)}
          {resolved && city && (
            <Badge variant="secondary" className="font-normal">
              {city.label} · {resolved.approx ? t("gold.approx") : "GRT"}
            </Badge>
          )}
        </CardTitle>
        <MetalChange changePct={price.changePct} change={price.change} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <p className="text-xs text-muted-foreground">{isGold ? t("gold.perGram22k") : t("gold.perGram24k")}</p>
          <p className="tnum text-3xl font-extrabold tracking-tight">
            {formatMoney(headline, { currency: "INR" })}
          </p>
          {resolved && city && (
            <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
              {resolved.approx
                ? t("gold.approxDetail", {
                    spot: formatMoney(price.pricePerGram22k, { currency: "INR" }),
                    premium: city.premiumPct,
                  })
                : t("gold.sourceDetail", {
                    source: resolved.source,
                    spot: formatMoney(price.pricePerGram22k, { currency: "INR" }),
                  })}
            </p>
          )}
        </div>
        {isGold && resolved && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t("gold.perGram24k")} value={resolved.gram24k} />
            <Stat label={t("gold.perGram18k")} value={resolved.gram18k} />
          </div>
        )}
        <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
          <span className="tnum">
            {t("gold.spotOz", { value: formatMoney(price.pricePerOunce, { currency: "INR", compact: true }) })}
          </span>
          <span>
            {stale
              ? t("gold.lastClose", { date: asOf(price.date) })
              : t("gold.asOf", { date: asOf(price.date) })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function GoldPage() {
  const { t } = useTranslation("credits");
  const [metal, setMetal] = useState<Metal>("gold");
  const [days, setDays] = useState(30);
  const [chart, setChart] = useState<"area" | "bar">("area");
  const [cityKey, setCityKey] = useState(DEFAULT_CITY);
  const city = findCity(cityKey);
  const { data: latest, isLoading } = useMetalsLatest();
  const { data: history } = useMetalHistory(metal, days);
  const refresh = useRefreshMetals();

  // Where today sits against its own recent history — the only honest thing a
  // rate chart can say about whether to buy. The series matches what's plotted,
  // so the shading and the verdict can never disagree with the line.
  const series = useMemo(
    () => metalChartSeries(history ?? [], metal, city).map((p) => p.value).filter((v) => v > 0),
    [history, metal, city]
  );
  const windowAverages = useMemo(
    () => averagesFor(series).filter((w) => series.length >= w.days),
    [series]
  );
  // The threshold is the average of the range on screen, so 1Y works the same as
  // 7D without a special case.
  const signal = useMemo(
    () => buySignal(series.at(-1) ?? 0, movingAverage(series, days)),
    [series, days]
  );

  async function refreshNow() {
    try {
      await refresh.mutateAsync();
      toast.success(t("gold.refreshed"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("gold.refreshFailed"));
    }
  }

  return (
    <div>
      <PageHeader
        title={t("gold.title")}
        description={t("gold.description")}
        actions={
          <div className="flex items-center gap-2">
            <Select value={cityKey} onValueChange={setCityKey}>
              <SelectTrigger className="w-40" aria-label={t("gold.cityAria")}>
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
              aria-label={t("gold.refreshAria")}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Skeleton className="h-44 rounded-xl" />
            <Skeleton className="h-44 rounded-xl" />
          </div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : !latest?.configured ? (
        <EmptyState
          icon={Coins}
          title={t("gold.notConfiguredTitle")}
          description={t("gold.notConfiguredDesc")}
        />
      ) : !latest.gold && !latest.silver ? (
        <EmptyState
          icon={TrendingUp}
          title={t("gold.noRatesTitle")}
          description={t("gold.noRatesDesc")}
        />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {latest.gold && <MetalBigCard price={latest.gold} metal="gold" city={city} />}
            {latest.silver && <MetalBigCard price={latest.silver} metal="silver" />}
          </div>

          <Card>
            <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>{t("gold.history")}</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={metal} onValueChange={(v) => setMetal(v as Metal)}>
                  <TabsList className="h-8">
                    <TabsTrigger value="gold">{t("gold.metal.gold")}</TabsTrigger>
                    <TabsTrigger value="silver">{t("gold.metal.silver")}</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                  <TabsList className="h-8">
                    <TabsTrigger value="7">{t("gold.range.7d")}</TabsTrigger>
                    <TabsTrigger value="30">{t("gold.range.30d")}</TabsTrigger>
                    <TabsTrigger value="90">{t("gold.range.90d")}</TabsTrigger>
                    <TabsTrigger value="365">{t("gold.range.1y")}</TabsTrigger>
                  </TabsList>
                </Tabs>
                <Tabs value={chart} onValueChange={(v) => setChart(v as "area" | "bar")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="area" aria-label={t("gold.chart.line")}>
                      <LineChartIcon className="h-4 w-4" />
                    </TabsTrigger>
                    <TabsTrigger value="bar" aria-label={t("gold.chart.bar")}>
                      <BarChart3 className="h-4 w-4" />
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {history && history.length > 1 ? (
                <MetalHistoryChart
                  data={history}
                  color={METAL_META[metal].color}
                  metal={metal}
                  city={city}
                  variant={chart}
                  zones={signal.average > 0 ? signal : null}
                />
              ) : (
                <div className="flex h-[280px] flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
                  <TrendingUp className="h-6 w-6" />
                  <p>{t("gold.historyBuildingTitle")}</p>
                  <p className="text-xs">
                    {t("gold.historyBuildingDesc")}
                  </p>
                </div>
              )}
              {/* The page's conclusion, so it reads as one. */}
              <BuySignalBanner
                signal={signal}
                days={days}
                averages={windowAverages}
                className="mt-4"
              />
            </CardContent>
          </Card>

          <JewelleryCalculator
            gold={latest.gold}
            silver={latest.silver}
            goldRate22k={latest.gold && city ? resolveCityRate(latest.gold, city).gram22k : undefined}
          />

          <p className="text-center text-xs text-muted-foreground">
            {t("gold.disclaimer")}
          </p>
        </div>
      )}
    </div>
  );
}
