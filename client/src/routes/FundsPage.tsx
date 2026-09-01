import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Layers, Plus, RefreshCw, Repeat, Trash2, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { fmtDate } from "@/lib/dates";
import {
  useDeleteFundLot,
  useFundPortfolio,
  useFundRedemptions,
  useRefreshNavs,
} from "@/hooks/useFunds";
import { BuyFundDialog } from "@/features/funds/BuyFundDialog";
import { RedeemFundDialog } from "@/features/funds/RedeemFundDialog";
import type { FundLotView, FundPosition } from "@/lib/types";

/** Signed money with the income/expense colour, used for every P&L figure here. */
function PL({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("tnum font-semibold", value >= 0 ? "text-income" : "text-expense", className)}>
      {value >= 0 ? "+" : "−"}
      {formatMoney(Math.abs(value))}
    </span>
  );
}

export default function FundsPage() {
  const { t } = useTranslation("funds");
  const { data: portfolio, isLoading } = useFundPortfolio();
  const { data: redemptions } = useFundRedemptions();
  const refresh = useRefreshNavs();
  const [buyOpen, setBuyOpen] = useState(false);
  const [redeeming, setRedeeming] = useState<FundPosition | null>(null);

  const positions = portfolio?.positions ?? [];

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("page.refresh")}
              disabled={refresh.isPending}
              onClick={async () => {
                try {
                  const res = await refresh.mutateAsync();
                  toast.success(t("page.refreshed", { count: res.schemes ?? 0 }));
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : t("page.refreshFailed"));
                }
              }}
            >
              <RefreshCw className={cn(refresh.isPending && "animate-spin")} />
            </Button>
            <Button onClick={() => setBuyOpen(true)}>
              <Plus /> {t("page.addPurchase")}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : positions.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button onClick={() => setBuyOpen(true)}>
              <Plus /> {t("page.addPurchase")}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {/* Totals */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("totals.value")} value={formatMoney(portfolio!.marketValue)} />
            <Stat label={t("totals.invested")} value={formatMoney(portfolio!.invested)} />
            <Stat
              label={t("totals.unrealised")}
              value={<PL value={portfolio!.unrealizedPL} />}
              hint={`${portfolio!.unrealizedPct >= 0 ? "+" : ""}${portfolio!.unrealizedPct}%`}
            />
            <Stat label={t("totals.realised")} value={<PL value={portfolio!.realizedPL} />} />
          </div>

          {portfolio!.stale && (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {t("totals.staleHint")}
            </p>
          )}

          {/* Holdings */}
          <div className="space-y-3">
            {positions.map((p) => (
              <PositionCard key={p.schemeCode} position={p} onRedeem={() => setRedeeming(p)} />
            ))}
          </div>

          {/* Realised gains */}
          {redemptions && redemptions.length > 0 && (
            <Card>
              <CardContent className="p-5">
                <h2 className="mb-3 text-sm font-semibold">{t("redemptions.title")}</h2>
                <div className="space-y-2">
                  {redemptions.map((r) => (
                    <div key={r._id} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {t("redemptions.units", { units: r.units })}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(r.sellDate, "dd MMM yyyy")} · ₹{r.sellNav}
                        </p>
                      </div>
                      <PL value={r.realizedPL} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <BuyFundDialog open={buyOpen} onOpenChange={setBuyOpen} />
      <RedeemFundDialog position={redeeming} onClose={() => setRedeeming(null)} />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="tnum mt-1 text-2xl font-bold">{value}</p>
        {hint && <p className="tnum mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** One scheme: what it's worth now, and the purchases underneath it. */
function PositionCard({ position: p, onRedeem }: { position: FundPosition; onRedeem: () => void }) {
  const { t } = useTranslation("funds");
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-56">
            <p className="truncate font-semibold">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[p.plan, p.option, p.fundHouse].filter(Boolean).join(" · ")}
            </p>
            <p className="tnum mt-1 text-xs text-muted-foreground">
              {t("position.unitsAt", { units: p.units, nav: p.avgNav })}
              {p.navDate ? ` · ${t("position.navOn", { date: fmtDate(p.navDate, "dd MMM") })}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="tnum text-lg font-bold">{formatMoney(p.marketValue)}</p>
            <p className="tnum text-xs">
              <PL value={p.unrealizedPL} className="text-xs" />{" "}
              <span className="text-muted-foreground">
                ({p.unrealizedPct >= 0 ? "+" : ""}
                {p.unrealizedPct}%)
              </span>
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {p.folios.map((f) => (
            <Badge key={f} variant="secondary" className="text-[10px]">
              {t("position.folio", { folio: f })}
            </Badge>
          ))}
          {p.daysToLongTerm != null && p.daysToLongTerm > 0 && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <TrendingUp className="h-3 w-3" />
              {t("position.longTermIn", { days: p.daysToLongTerm })}
            </Badge>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRedeem}>
            {t("position.redeem")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)}>
            {t("position.lots", { count: p.lots.length })}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </Button>
        </div>

        {open && (
          <div className="mt-3 space-y-2">
            {p.lots.map((lot) => (
              <LotRow key={lot.id} lot={lot} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One purchase. A SIP installment says so — it wasn't entered by hand. */
function LotRow({ lot }: { lot: FundLotView }) {
  const { t } = useTranslation("funds");
  const del = useDeleteFundLot();
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
      <div className="min-w-0 flex-1 basis-44">
        <p className="tnum font-medium">
          {t("position.unitsAt", { units: lot.unitsRemaining, nav: lot.buyNav })}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{fmtDate(lot.buyDate, "dd MMM yyyy")}</span>
          {lot.sip && (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Repeat className="h-3 w-3" /> {t("position.sip")}
            </Badge>
          )}
          {lot.daysToLongTerm > 0 && <span>{t("position.longTermIn", { days: lot.daysToLongTerm })}</span>}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground hover:text-destructive"
        aria-label={t("position.deleteLot")}
        onClick={() => setConfirm(true)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>

      <ConfirmDeleteDialog
        open={confirm}
        onOpenChange={setConfirm}
        itemKey="fundLot"
        confirmValue={t("position.lotLabel", { units: lot.units })}
        onConfirm={async () => {
          try {
            await del.mutateAsync(lot.id);
            toast.success(t("position.lotDeleted"));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("position.lotDeleteFailed"));
            throw e;
          }
        }}
      />
    </div>
  );
}
