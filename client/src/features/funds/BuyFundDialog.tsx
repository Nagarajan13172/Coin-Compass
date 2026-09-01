import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AmountInput } from "@/components/common/AmountInput";
import { useAccounts } from "@/hooks/useAccounts";
import { useBuyFund } from "@/hooks/useFunds";
import { formatMoney } from "@/lib/format";
import { FundSearchCombobox } from "./FundSearchCombobox";
import type { FundHit } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Pre-selected scheme, when buying more of something already held. */
  fund?: FundHit | null;
}

/**
 * Record a fund purchase. Two ways in, because two things know different halves:
 * a bank debit knows the rupees, an AMC statement knows the units. Whichever is
 * entered, the other follows from the NAV.
 */
export function BuyFundDialog({ open, onOpenChange, fund = null }: Props) {
  const { t } = useTranslation("funds");
  const { data: accounts } = useAccounts();
  const buy = useBuyFund();

  const [selected, setSelected] = useState<FundHit | null>(fund);
  const [mode, setMode] = useState<"amount" | "units">("amount");
  const [amount, setAmount] = useState("");
  const [units, setUnits] = useState("");
  const [nav, setNav] = useState("");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [folio, setFolio] = useState("");
  const [note, setNote] = useState("");
  const [recordCash, setRecordCash] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelected(fund);
    setMode("amount");
    setAmount("");
    setUnits("");
    setNav(fund?.nav ? String(fund.nav) : "");
    setAccount(accounts?.[0]?._id ?? "");
    setDate(new Date().toISOString().slice(0, 10));
    setFolio("");
    setNote("");
    setRecordCash(true);
  }, [open, fund, accounts]);

  // Follow the scheme's published NAV until the user overrides it.
  useEffect(() => {
    if (selected?.nav) setNav(String(selected.nav));
  }, [selected]);

  const navNum = Number(nav) || 0;
  const preview =
    mode === "amount"
      ? navNum > 0 && Number(amount) > 0
        ? t("buy.previewUnits", { units: (Number(amount) / navNum).toFixed(4) })
        : null
      : navNum > 0 && Number(units) > 0
        ? t("buy.previewCost", { amount: formatMoney(Number(units) * navNum) })
        : null;

  async function submit() {
    if (!selected) return toast.error(t("buy.pickFund"));
    if (!account) return toast.error(t("buy.pickAccount"));
    if (mode === "amount" ? !Number(amount) : !Number(units)) return toast.error(t("buy.enterAmount"));
    try {
      await buy.mutateAsync({
        schemeCode: selected.schemeCode,
        account,
        ...(mode === "amount" ? { amount: Number(amount) } : { units: Number(units) }),
        ...(navNum > 0 ? { nav: navNum } : {}),
        buyDate: new Date(date).toISOString(),
        folio: folio.trim(),
        note: note.trim(),
        recordCash,
      });
      toast.success(t("buy.done", { name: selected.name }));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("buy.failed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("buy.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fund-search">{t("buy.fund")}</Label>
            <FundSearchCombobox id="fund-search" value={selected} onChange={setSelected} />
          </div>

          {/* Amount or units — the same purchase, entered from either side. */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
            {(["amount", "units"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                }`}
              >
                {t(`buy.by${m === "amount" ? "Amount" : "Units"}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fund-amount">
                {mode === "amount" ? t("buy.amount") : t("buy.units")}
              </Label>
              {mode === "amount" ? (
                <AmountInput id="fund-amount" value={amount} onChange={setAmount} placeholder="5,000" />
              ) : (
                <Input
                  id="fund-amount"
                  inputMode="decimal"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                  placeholder="11.284"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fund-nav">{t("buy.nav")}</Label>
              <Input
                id="fund-nav"
                inputMode="decimal"
                value={nav}
                onChange={(e) => setNav(e.target.value)}
                placeholder="443.12"
              />
            </div>
          </div>
          {preview && <p className="text-xs text-muted-foreground">{preview}</p>}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fund-account">{t("buy.paidFrom")}</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger id="fund-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fund-date">{t("buy.date")}</Label>
              <Input id="fund-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fund-folio">{t("buy.folio")}</Label>
              <Input
                id="fund-folio"
                value={folio}
                onChange={(e) => setFolio(e.target.value)}
                placeholder={t("buy.folioPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fund-note">{t("buy.note")}</Label>
              <Input id="fund-note" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>

          {/* Units you already owned before tracking started here: recording a
              payment that never happened would corrupt the account's history. */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="min-w-0 pr-3">
              <p className="text-sm font-medium">{t("buy.recordCash")}</p>
              <p className="text-xs text-muted-foreground">{t("buy.recordCashHint")}</p>
            </div>
            <Switch checked={recordCash} onCheckedChange={setRecordCash} aria-label={t("buy.recordCash")} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={buy.isPending}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={buy.isPending || !selected}>
            {buy.isPending ? t("states.saving", { ns: "common" }) : t("buy.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
