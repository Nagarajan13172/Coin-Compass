import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AmountInput } from "@/components/common/AmountInput";
import { useSellStock } from "@/hooks/useStocks";
import { formatMoney } from "@/lib/format";
import { previewFifo } from "@/lib/stocks";
import type { StockPosition } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  position: StockPosition | null;
  /** The demat account the position sits in. */
  dematId: string;
}

function todayInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Sell shares of one position. Mirrors the server's FIFO allocation locally so
 * the user can see, before confirming, which lots will be consumed and how much
 * of the gain lands as long-term — the difference is real money at tax time.
 */
export function SellStockDialog({ open, onOpenChange, position, dematId }: Props) {
  const { t } = useTranslation("stocks");
  const sell = useSellStock();

  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [date, setDate] = useState(todayInput());

  useEffect(() => {
    if (!open) return;
    setQty("");
    // Seed at the last traded price — the overwhelmingly common case.
    setPrice(position?.price != null ? String(position.price) : "");
    setFees("");
    setDate(todayInput());
  }, [open, position]);

  const preview = useMemo(() => {
    if (!position) return null;
    const q = Number(qty);
    const p = Number(price);
    if (!(q > 0) || !(p >= 0)) return null;
    return previewFifo(position.lots, q, p, Number(fees || 0), new Date(date));
  }, [position, qty, price, fees, date]);

  async function submit() {
    if (!position) return;
    const q = Number(qty);
    if (!(q > 0)) return toast.error(t("sell.enterQty"));
    if (q > position.qty) return toast.error(t("sell.tooMany", { held: position.qty }));
    const p = Number(price);
    if (!(p >= 0)) return toast.error(t("sell.enterPrice"));

    try {
      await sell.mutateAsync({
        symbol: position.symbol,
        demat: dematId,
        qty: q,
        sellPrice: p,
        fees: Number(fees || 0),
        sellDate: date,
      });
      toast.success(t("sell.recorded", { ticker: position.ticker }));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  if (!position) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("sell.title", { ticker: position.ticker })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-muted/60 p-2.5 text-xs">
            <span className="text-muted-foreground">{t("sell.youHold")}</span>
            <span className="tnum font-medium">
              {t("sell.sharesAt", { qty: position.qty, price: formatMoney(position.avgCost) })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sell-qty">{t("sell.quantity")}</Label>
              <Input
                id="sell-qty"
                type="number"
                inputMode="decimal"
                min="0"
                max={position.qty}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder={String(position.qty)}
              />
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setQty(String(position.qty))}
              >
                {t("sell.sellAll")}
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sell-price">{t("sell.pricePerShare")}</Label>
              <AmountInput id="sell-price" value={price} onChange={setPrice} placeholder="1,400" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sell-date">{t("sell.sellDate")}</Label>
              <Input id="sell-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sell-fees">{t("buy.charges")}</Label>
              <AmountInput id="sell-fees" value={fees} onChange={setFees} placeholder="30" />
            </div>
          </div>

          {preview && (
            <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs">
              <p className="font-medium text-muted-foreground">{t("sell.previewTitle")}</p>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("sell.proceeds")}</span>
                <span className="tnum font-medium">{formatMoney(preview.proceeds)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">{t("sell.costBasis")}</span>
                <span className="tnum font-medium">{formatMoney(preview.costBasis)}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-1.5">
                <span className="text-muted-foreground">{t("sell.realized")}</span>
                <span className={`tnum font-semibold ${preview.realizedPL >= 0 ? "text-income" : "text-expense"}`}>
                  {preview.realizedPL >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(preview.realizedPL))}
                </span>
              </div>

              {(preview.realizedLongTerm !== 0 || preview.realizedShortTerm !== 0) && (
                <div className="space-y-1 border-t pt-1.5">
                  {preview.realizedLongTerm !== 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("sell.longTerm")}</span>
                      <span className="tnum">{formatMoney(preview.realizedLongTerm)}</span>
                    </div>
                  )}
                  {preview.realizedShortTerm !== 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{t("sell.shortTerm")}</span>
                      <span className="tnum">{formatMoney(preview.realizedShortTerm)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* The single most actionable warning this app can give: waiting a
                  few days can move a gain from short-term to long-term. */}
              {preview.nearlyLongTerm != null && (
                <p className="flex items-start gap-1.5 border-t pt-1.5 text-amber-600 dark:text-amber-500">
                  <CalendarClock className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{t("sell.nearlyLongTerm", { days: preview.nearlyLongTerm })}</span>
                </p>
              )}

              <p className="border-t pt-1.5 text-[11px] text-muted-foreground">
                {t("sell.fifoNote", { count: preview.allocations.length })}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={sell.isPending}>
            {t("sell.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
