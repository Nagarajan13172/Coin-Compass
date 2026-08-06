import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Info } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AmountInput } from "@/components/common/AmountInput";
import { StockSearchCombobox } from "./StockSearchCombobox";
import { useBuyStock } from "@/hooks/useStocks";
import { useAccounts } from "@/hooks/useAccounts";
import { formatMoney } from "@/lib/format";
import type { InstrumentHit } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Pre-selected instrument when buying more of something already held. */
  preset?: InstrumentHit | null;
}

/** Today as yyyy-mm-dd in local time — what <input type="date"> expects. */
function todayInput(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function BuyStockDialog({ open, onOpenChange, preset }: Props) {
  const { t } = useTranslation("stocks");
  const buy = useBuyStock();
  const { data: accounts } = useAccounts();

  const dematAccounts = useMemo(
    () => (accounts ?? []).filter((a) => a.type === "demat" && !a.archived),
    [accounts]
  );

  const [instrument, setInstrument] = useState<InstrumentHit | null>(null);
  const [demat, setDemat] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [fees, setFees] = useState("");
  const [date, setDate] = useState(todayInput());
  const [recordCash, setRecordCash] = useState(true);

  useEffect(() => {
    if (!open) return;
    setInstrument(preset ?? null);
    setDemat(dematAccounts[0]?._id ?? "");
    setQty("");
    setPrice("");
    setFees("");
    setDate(todayInput());
    setRecordCash(true);
  }, [open, preset, dematAccounts]);

  const total = useMemo(() => {
    const q = Number(qty);
    const p = Number(price);
    const f = Number(fees || 0);
    if (!(q > 0) || !(p >= 0)) return null;
    return q * p + f;
  }, [qty, price, fees]);

  const dematBalance = dematAccounts.find((a) => a._id === demat)?.balance ?? 0;
  const shortfall = recordCash && total != null ? total - dematBalance : 0;

  async function submit() {
    if (!instrument) return toast.error(t("buy.pickStock"));
    if (!demat) return toast.error(t("buy.pickDemat"));
    const q = Number(qty);
    if (!(q > 0)) return toast.error(t("buy.enterQty"));
    const p = Number(price);
    if (!(p >= 0)) return toast.error(t("buy.enterPrice"));

    try {
      await buy.mutateAsync({
        symbol: instrument.symbol,
        demat,
        qty: q,
        buyPrice: p,
        fees: Number(fees || 0),
        buyDate: date,
        recordCash,
      });
      toast.success(t("buy.added", { ticker: instrument.ticker }));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("buy.title")}</DialogTitle>
        </DialogHeader>

        {dematAccounts.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-center">
            <p className="text-sm font-medium">{t("buy.noDematTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("buy.noDematDesc")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="buy-symbol">{t("buy.stock")}</Label>
              <StockSearchCombobox id="buy-symbol" value={instrument} onChange={setInstrument} />
            </div>

            <div className="space-y-1.5">
              <Label>{t("buy.dematAccount")}</Label>
              <Select value={demat} onValueChange={setDemat}>
                <SelectTrigger>
                  <SelectValue placeholder={t("buy.pickDemat")} />
                </SelectTrigger>
                <SelectContent>
                  {dematAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name} · {formatMoney(a.balance ?? 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="buy-qty">{t("buy.quantity")}</Label>
                <Input
                  id="buy-qty"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buy-price">{t("buy.pricePerShare")}</Label>
                <AmountInput id="buy-price" value={price} onChange={setPrice} placeholder="1,322" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="buy-date">{t("buy.buyDate")}</Label>
                <Input id="buy-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buy-fees">{t("buy.charges")}</Label>
                <AmountInput id="buy-fees" value={fees} onChange={setFees} placeholder="25" />
              </div>
            </div>
            <p className="-mt-2 text-[11px] leading-snug text-muted-foreground">{t("buy.chargesHint")}</p>

            <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="buy-record-cash" className="text-sm">
                  {t("buy.payFromDemat")}
                </Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("buy.payFromDematHint")}</p>
              </div>
              <Switch id="buy-record-cash" checked={recordCash} onCheckedChange={setRecordCash} />
            </div>

            {total != null && (
              <div className="space-y-1 rounded-md bg-muted/60 p-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">{t("buy.totalCost")}</span>
                  <span className="tnum font-medium">{formatMoney(total)}</span>
                </div>
                {recordCash && shortfall > 0 && (
                  <p className="flex items-start gap-1.5 pt-1 text-amber-600 dark:text-amber-500">
                    <Info className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{t("buy.shortfall", { amount: formatMoney(shortfall) })}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={buy.isPending || dematAccounts.length === 0}>
            {t("buy.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
