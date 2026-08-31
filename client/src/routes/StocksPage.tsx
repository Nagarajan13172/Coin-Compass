import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  LineChart,
  Plus,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { CountUp } from "@/components/common/CountUp";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BuyStockDialog } from "@/features/stocks/BuyStockDialog";
import { SellStockDialog } from "@/features/stocks/SellStockDialog";
import { PendingSplitsBanner } from "@/features/stocks/PendingSplitsBanner";
import {
  useDeleteLot,
  useDeleteSale,
  usePortfolio,
  useRefreshPrices,
  useStockSales,
} from "@/hooks/useStocks";
import { useAccounts } from "@/hooks/useAccounts";
import { formatMoney } from "@/lib/format";
import { fmtDate } from "@/lib/dates";
import type { StockPosition, StockSale } from "@/lib/types";

export default function StocksPage() {
  const { t } = useTranslation("stocks");
  const { data: portfolio, isLoading } = usePortfolio();
  const { data: accounts } = useAccounts();
  const refresh = useRefreshPrices();

  const [buyOpen, setBuyOpen] = useState(false);
  const [selling, setSelling] = useState<StockPosition | null>(null);

  const dematId = useMemo(
    () => (accounts ?? []).find((a) => a.type === "demat" && !a.archived)?._id ?? "",
    [accounts]
  );
  const hasDemat = Boolean(dematId);

  const totals = portfolio?.totals;
  const positions = portfolio?.positions ?? [];
  const gain = totals?.unrealized ?? 0;

  async function doRefresh() {
    try {
      await refresh.mutateAsync();
      toast.success(t("refresh.done"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  if (isLoading) {
    return (
      <div>
        <PageHeader title={t("title")} description={t("description")} />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={doRefresh} disabled={refresh.isPending}>
              <RefreshCw className={refresh.isPending ? "animate-spin" : ""} />
              <span className="hidden sm:inline">{t("refresh.action")}</span>
            </Button>
            <Button size="sm" onClick={() => setBuyOpen(true)}>
              <Plus /> {t("buy.action")}
            </Button>
          </div>
        }
      />

      {/* Sits above everything: until a split is applied the numbers below it
          understate the position, so it needs to be read first. */}
      <PendingSplitsBanner />

      {!hasDemat && (
        <Card className="mb-5 border-dashed">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{t("noDemat.title")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t("noDemat.description")}</p>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/accounts">
                {t("noDemat.action")} <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {positions.length > 0 && totals && (
        <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="surface-gradient">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{t("summary.value")}</p>
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                    gain >= 0 ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
                  }`}
                >
                  {gain >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                </span>
              </div>
              <CountUp value={totals.marketValue} id="pf-value" className="tnum block text-3xl font-extrabold" />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("summary.dayChange")}{" "}
                <span className={totals.dayChange >= 0 ? "text-income" : "text-expense"}>
                  {totals.dayChange >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(totals.dayChange))}
                </span>
              </p>
            </CardContent>
          </Card>

          <StatCard label={t("summary.invested")} value={formatMoney(totals.investedCost)} />

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t("summary.unrealized")}</p>
              <span
                className={`tnum block text-2xl font-bold ${gain >= 0 ? "text-income" : "text-expense"}`}
              >
                {gain >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(gain))}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {totals.unrealizedPct >= 0 ? "+" : ""}
                {totals.unrealizedPct}%
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t("summary.realized")}</p>
              <span
                className={`tnum block text-2xl font-bold ${
                  totals.realizedPL >= 0 ? "text-income" : "text-expense"
                }`}
              >
                {totals.realizedPL >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(totals.realizedPL))}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("summary.realizedSplit", {
                  long: formatMoney(totals.realizedLongTerm),
                  short: formatMoney(totals.realizedShortTerm),
                })}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Never dress a carried-forward close up as a live quote. */}
      {portfolio?.anyStale && positions.length > 0 && (
        <p className="mb-4 text-xs text-muted-foreground">
          {t("summary.stale", {
            date: portfolio.pricedAt ? fmtDate(portfolio.pricedAt) : t("summary.unknownDate"),
          })}
        </p>
      )}

      <Tabs defaultValue="holdings">
        <TabsList className="mb-5">
          <TabsTrigger value="holdings">{t("tabs.holdings")}</TabsTrigger>
          <TabsTrigger value="sold">{t("tabs.sold")}</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          {positions.length ? (
            <div className="space-y-3">
              {positions.map((p, i) => (
                <PositionRow
                  key={p.symbol}
                  position={p}
                  index={i}
                  onSell={() => setSelling(p)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={LineChart}
              title={t("empty.title")}
              description={t("empty.description")}
              action={
                <Button onClick={() => setBuyOpen(true)}>
                  <Plus /> {t("buy.action")}
                </Button>
              }
            />
          )}
        </TabsContent>

        <TabsContent value="sold">
          <SoldTab />
        </TabsContent>
      </Tabs>

      <BuyStockDialog open={buyOpen} onOpenChange={setBuyOpen} />
      <SellStockDialog
        open={Boolean(selling)}
        onOpenChange={(o) => !o && setSelling(null)}
        position={selling}
        dematId={dematId}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span className="tnum block text-2xl font-bold">{value}</span>
      </CardContent>
    </Card>
  );
}

function PositionRow({
  position,
  index,
  onSell,
}: {
  position: StockPosition;
  index: number;
  onSell: () => void;
}) {
  const { t } = useTranslation("stocks");
  const [expanded, setExpanded] = useState(false);
  const del = useDeleteLot();
  const [deleteTarget, setDeleteTarget] = useState<StockPosition["lots"][number] | null>(null);

  const up = position.unrealized >= 0;
  // The soonest lot still counting down — the badge worth surfacing on the row.
  const nextLongTerm = position.lots
    .filter((l) => !l.longTerm)
    .map((l) => l.daysToLongTerm)
    .sort((a, b) => a - b)[0];

  async function confirmDelete(lotId: string) {
    try {
      await del.mutateAsync(lotId);
      toast.success(t("lots.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
      throw e; // keep the dialog open on failure
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.03, 0.2) }}
    >
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold">{position.ticker}</p>
                <Badge variant="secondary" className="text-[10px]">
                  {position.exchange}
                </Badge>
                {position.stale && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="cursor-default text-[10px] text-muted-foreground">
                        {t("position.stale")}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {t("position.staleTip", { date: position.priceDate ?? "—" })}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">{position.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("position.qtyAtAvg", {
                  qty: position.qty,
                  avg: formatMoney(position.avgCost),
                })}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="tnum text-sm font-semibold">{formatMoney(position.marketValue)}</p>
              <p className={`tnum text-xs ${up ? "text-income" : "text-expense"}`}>
                {up ? "+" : "−"}
                {formatMoney(Math.abs(position.unrealized))} ({position.unrealizedPct}%)
              </p>
              {position.price != null && (
                <p className="tnum mt-0.5 text-[11px] text-muted-foreground">
                  {t("position.ltp", { price: formatMoney(position.price) })}
                </p>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="tnum text-[11px] text-muted-foreground">
              {t("position.allocation", { pct: position.allocationPct })}
            </span>
            {nextLongTerm != null && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="cursor-default gap-1 text-[10px]">
                    <CalendarClock className="h-3 w-3" />
                    {t("position.ltcgIn", { days: nextLongTerm })}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-56 text-xs">{t("position.ltcgTip")}</TooltipContent>
              </Tooltip>
            )}
            <div className="ml-auto flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onSell}>
                {t("sell.action")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
              >
                {t("position.lotsCount", { count: position.lots.length })}
                <ChevronDown className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </Button>
            </div>
          </div>

          {expanded && (
            <ul className="mt-3 space-y-2 border-t pt-3">
              {position.lots.map((lot) => (
                <li key={lot._id} className="flex items-center gap-3 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {t("lots.line", {
                        qty: lot.qtyRemaining,
                        price: formatMoney(lot.buyPrice),
                        date: fmtDate(lot.buyDate),
                      })}
                    </p>
                    {lot.note && <p className="truncate text-muted-foreground">{lot.note}</p>}
                  </div>
                  <Badge
                    variant={lot.longTerm ? "secondary" : "outline"}
                    className="shrink-0 text-[10px]"
                  >
                    {lot.longTerm ? t("lots.longTerm") : t("lots.daysToLtcg", { days: lot.daysToLongTerm })}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("lots.deleteAria")}
                    onClick={() => setDeleteTarget(lot)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {deleteTarget && (
        <ConfirmDeleteDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="stockLot"
          confirmValue={t("lots.line", {
            qty: deleteTarget.qtyRemaining,
            price: formatMoney(deleteTarget.buyPrice),
            date: fmtDate(deleteTarget.buyDate),
          })}
          onConfirm={() => confirmDelete(deleteTarget._id)}
        />
      )}
    </motion.div>
  );
}

function SoldTab() {
  const { t } = useTranslation("stocks");
  const { data: sales, isLoading } = useStockSales();
  const del = useDeleteSale();
  const [deleteTarget, setDeleteTarget] = useState<StockSale | null>(null);

  async function confirmDelete(sale: StockSale) {
    try {
      await del.mutateAsync(sale._id);
      toast.success(t("sold.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
      throw e;
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!sales?.length) {
    return <EmptyState icon={LineChart} title={t("sold.emptyTitle")} description={t("sold.emptyDesc")} />;
  }

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle as="h2">{t("sold.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {sales.map((s) => {
              const up = s.realizedPL >= 0;
              return (
                <li key={s._id} className="flex items-center gap-3 border-b pb-3 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.ticker}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t("sold.line", {
                        qty: s.qty,
                        price: formatMoney(s.sellPrice),
                        date: fmtDate(s.sellDate),
                      })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`tnum text-sm font-semibold ${up ? "text-income" : "text-expense"}`}>
                      {up ? "+" : "−"}
                      {formatMoney(Math.abs(s.realizedPL))}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.realizedLongTerm !== 0 && t("sold.ltcg", { amount: formatMoney(s.realizedLongTerm) })}
                      {s.realizedLongTerm !== 0 && s.realizedShortTerm !== 0 && " · "}
                      {s.realizedShortTerm !== 0 && t("sold.stcg", { amount: formatMoney(s.realizedShortTerm) })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("sold.deleteAria")}
                    onClick={() => setDeleteTarget(s)}
                  >
                    <Trash2 className="text-destructive" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {deleteTarget && (
        <ConfirmDeleteDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="stockSale"
          confirmValue={t("sold.line", {
            qty: deleteTarget.qty,
            price: formatMoney(deleteTarget.sellPrice),
            date: fmtDate(deleteTarget.sellDate),
          })}
          onConfirm={() => confirmDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
