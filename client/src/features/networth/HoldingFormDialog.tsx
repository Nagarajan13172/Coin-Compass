import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateHolding, useUpdateHolding } from "@/hooks/useHoldings";
import { useSettings } from "@/hooks/useSettings";
import { SAVING_SUBTYPES, INVESTMENT_SUBTYPES, holdingGrowth, formatMonths } from "@/lib/networth";
import { formatMoney } from "@/lib/format";
import { enumLabel } from "@/lib/i18nLabels";
import { RecordMeta } from "@/components/common/RecordMeta";
import type { Holding, HoldingClass, HoldingSubtype } from "@/lib/types";

/** ISO timestamp → the yyyy-mm-dd a <input type="date"> expects (no TZ shift). */
function toDateInput(iso?: string | null): string {
  return iso ? String(iso).slice(0, 10) : "";
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding?: Holding | null;
}

export function HoldingFormDialog({ open, onOpenChange, holding }: Props) {
  const { t } = useTranslation("wealth");
  const { data: settings } = useSettings();
  const create = useCreateHolding();
  const update = useUpdateHolding();
  const isEdit = Boolean(holding);

  const [name, setName] = useState("");
  const [cls, setCls] = useState<HoldingClass>("saving");
  const [subtype, setSubtype] = useState<HoldingSubtype>("fixed_deposit");
  const [value, setValue] = useState("");
  const [provider, setProvider] = useState("");
  // Optional deposit/growth details.
  const [invested, setInvested] = useState("");
  const [startDate, setStartDate] = useState("");
  const [maturityDate, setMaturityDate] = useState("");
  const [rate, setRate] = useState("");
  const [maturityValue, setMaturityValue] = useState("");
  const [showGrowth, setShowGrowth] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(holding?.name ?? "");
    setCls(holding?.class ?? "saving");
    setSubtype(holding?.subtype ?? "fixed_deposit");
    setValue(holding ? String(holding.value) : "");
    setProvider(holding?.provider ?? "");
    setInvested(holding?.investedAmount != null ? String(holding.investedAmount) : "");
    setStartDate(toDateInput(holding?.startDate));
    setMaturityDate(toDateInput(holding?.maturityDate));
    setRate(holding?.interestRate != null ? String(holding.interestRate) : "");
    setMaturityValue(holding?.maturityValue != null ? String(holding.maturityValue) : "");
    // Open the growth section automatically if this holding already uses it.
    setShowGrowth(
      Boolean(
        holding?.investedAmount != null ||
          holding?.startDate ||
          holding?.maturityDate ||
          holding?.interestRate != null ||
          holding?.maturityValue != null
      )
    );
  }, [open, holding]);

  const subtypes = cls === "saving" ? SAVING_SUBTYPES : INVESTMENT_SUBTYPES;

  // Live-derive rate / maturity value / gain / today's worth as the user types.
  const growth = useMemo(
    () => holdingGrowth({ invested, maturityValue, rate, startDate, maturityDate }, new Date()),
    [invested, maturityValue, rate, startDate, maturityDate]
  );

  function changeClass(next: HoldingClass) {
    setCls(next);
    // keep a valid subtype for the new class
    const list = next === "saving" ? SAVING_SUBTYPES : INVESTMENT_SUBTYPES;
    if (!list.some((s) => s.value === subtype)) setSubtype(list[0].value);
  }

  async function submit() {
    if (!name.trim()) return toast.error(t("holdingForm.enterName"));
    const v = Number(value);
    if (!(v >= 0)) return toast.error(t("holdingForm.enterValidValue"));
    const payload = {
      name: name.trim(),
      class: cls,
      subtype,
      value: v,
      provider: provider.trim(),
      currency: settings?.baseCurrency ?? "INR",
      investedAmount: invested === "" ? null : Number(invested),
      startDate: startDate || null,
      maturityDate: maturityDate || null,
      interestRate: rate === "" ? null : Number(rate),
      maturityValue: maturityValue === "" ? null : Number(maturityValue),
    };
    try {
      if (isEdit && holding) {
        await update.mutateAsync({ id: holding._id, ...payload });
        toast.success(t("holdingForm.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("holdingForm.added"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failedToSave"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("holdingForm.editTitle") : t("holdingForm.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hold-name">{t("labels.name", { ns: "common" })}</Label>
            <Input
              id="hold-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("holdingForm.namePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("labels.type", { ns: "common" })}</Label>
              <Select value={cls} onValueChange={(v) => changeClass(v as HoldingClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saving">{enumLabel("holdingClass", "saving")}</SelectItem>
                  <SelectItem value="investment">{enumLabel("holdingClass", "investment")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("labels.category", { ns: "common" })}</Label>
              <Select value={subtype} onValueChange={(v) => setSubtype(v as HoldingSubtype)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subtypes.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {enumLabel("holding", s.value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-value">{t("holdingForm.currentValue")}</Label>
            <Input
              id="hold-value"
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="100000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-provider">{t("holdingForm.providerInstitution")}</Label>
            <Input
              id="hold-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder={t("holdingForm.providerPlaceholder")}
            />
          </div>

          {/* Optional deposit/growth details — FD/RD/bond style holdings. */}
          {showGrowth ? (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{t("holdingForm.depositGrowthDetails")}</p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setShowGrowth(false)}
                >
                  {t("holdingForm.hide")}
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hold-invested">{t("holdingForm.amountInvested")}</Label>
                <Input
                  id="hold-invested"
                  type="number"
                  inputMode="decimal"
                  value={invested}
                  onChange={(e) => setInvested(e.target.value)}
                  placeholder="60000"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hold-start">{t("labels.startDate", { ns: "common" })}</Label>
                  <Input
                    id="hold-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hold-maturity">{t("holdingForm.maturityDate")}</Label>
                  <Input
                    id="hold-maturity"
                    type="date"
                    value={maturityDate}
                    onChange={(e) => setMaturityDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hold-rate">{t("holdingForm.interestRatePerYr")}</Label>
                  <Input
                    id="hold-rate"
                    type="number"
                    inputMode="decimal"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="8.9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hold-maturity-value">{t("holdingForm.maturityValue")}</Label>
                  <Input
                    id="hold-maturity-value"
                    type="number"
                    inputMode="decimal"
                    value={maturityValue}
                    onChange={(e) => setMaturityValue(e.target.value)}
                    placeholder="92000"
                  />
                </div>
              </div>

              <p className="text-[11px] leading-snug text-muted-foreground">
                {t("holdingForm.enterEitherPre")} <b>{t("holdingForm.either")}</b>{" "}
                {t("holdingForm.enterEitherPost")}
              </p>

              {/* Live calculation readout */}
              {(growth.termYears != null || growth.gain != null || growth.projectedNow != null) && (
                <div className="space-y-1.5 rounded-md bg-muted/60 p-2.5 text-xs">
                  {growth.termYears != null && (
                    <ReadoutRow label={t("holdingForm.term")} value={formatMonths(Math.round(growth.termYears * 12))} />
                  )}
                  {growth.rate != null && (
                    <ReadoutRow
                      label={growth.rateDerived ? t("holdingForm.returnCalculated") : t("holdingForm.return")}
                      value={t("units.perYearRate", { rate: growth.rate.toFixed(1) })}
                    />
                  )}
                  {growth.gain != null && (
                    <ReadoutRow
                      label={t("holdingForm.totalGain")}
                      value={`${growth.gain >= 0 ? "+" : "−"}${formatMoney(Math.abs(growth.gain))}${
                        growth.gainPct != null ? ` (${Math.round(growth.gainPct)}%)` : ""
                      }`}
                      className={growth.gain >= 0 ? "text-income" : "text-expense"}
                    />
                  )}
                  {growth.projectedNow != null && (
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-muted-foreground">{t("holdingForm.worthToday")}</span>
                      <span className="flex items-center gap-2">
                        <span className="tnum font-medium">{formatMoney(Math.round(growth.projectedNow))}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setValue(String(Math.round(growth.projectedNow!)))}
                        >
                          {t("holdingForm.useAsValue")}
                        </Button>
                      </span>
                    </div>
                  )}

                  {/* One-tap fill for whichever figure was derived. */}
                  {rate === "" && growth.rate != null && growth.rateDerived && (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setRate(growth.rate!.toFixed(2))}
                    >
                      {t("holdingForm.fillRate", { rate: growth.rate.toFixed(1) })}
                    </button>
                  )}
                  {maturityValue === "" && growth.maturityValue != null && growth.maturityDerived && (
                    <button
                      type="button"
                      className="block text-primary hover:underline"
                      onClick={() => setMaturityValue(String(Math.round(growth.maturityValue!)))}
                    >
                      {t("holdingForm.fillMaturity", { amount: formatMoney(Math.round(growth.maturityValue)) })}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-primary hover:underline"
              onClick={() => setShowGrowth(true)}
            >
              {t("holdingForm.addGrowthDetails")}
            </button>
          )}
          {isEdit && holding && <RecordMeta createdAt={holding.createdAt} updatedAt={holding.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? t("actions.save", { ns: "common" }) : t("actions.add", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReadoutRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tnum font-medium ${className ?? ""}`}>{value}</span>
    </div>
  );
}
