import { useEffect, useMemo, useState } from "react";
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
    if (!name.trim()) return toast.error("Enter a name");
    const v = Number(value);
    if (!(v >= 0)) return toast.error("Enter a valid value");
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
        toast.success("Asset updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Asset added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit asset" : "Add asset"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hold-name">Name</Label>
            <Input
              id="hold-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC FD / Nifty index fund / Gold coins"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={cls} onValueChange={(v) => changeClass(v as HoldingClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saving">Saving</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={subtype} onValueChange={(v) => setSubtype(v as HoldingSubtype)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subtypes.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-value">Current value</Label>
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
            <Label htmlFor="hold-provider">Provider / institution</Label>
            <Input
              id="hold-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Optional (e.g. HDFC Bank, Zerodha)"
            />
          </div>

          {/* Optional deposit/growth details — FD/RD/bond style holdings. */}
          {showGrowth ? (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Deposit / growth details</p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                  onClick={() => setShowGrowth(false)}
                >
                  Hide
                </button>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hold-invested">Amount invested</Label>
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
                  <Label htmlFor="hold-start">Start date</Label>
                  <Input
                    id="hold-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="hold-maturity">Maturity date</Label>
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
                  <Label htmlFor="hold-rate">Interest rate (% / yr)</Label>
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
                  <Label htmlFor="hold-maturity-value">Maturity value</Label>
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
                Enter <b>either</b> the interest rate or the maturity value — the other is
                calculated for you from the dates.
              </p>

              {/* Live calculation readout */}
              {(growth.termYears != null || growth.gain != null || growth.projectedNow != null) && (
                <div className="space-y-1.5 rounded-md bg-muted/60 p-2.5 text-xs">
                  {growth.termYears != null && (
                    <ReadoutRow label="Term" value={formatMonths(Math.round(growth.termYears * 12))} />
                  )}
                  {growth.rate != null && (
                    <ReadoutRow
                      label={growth.rateDerived ? "Return (calculated)" : "Return"}
                      value={`${growth.rate.toFixed(1)}% / yr`}
                    />
                  )}
                  {growth.gain != null && (
                    <ReadoutRow
                      label="Total gain"
                      value={`${growth.gain >= 0 ? "+" : "−"}${formatMoney(Math.abs(growth.gain))}${
                        growth.gainPct != null ? ` (${Math.round(growth.gainPct)}%)` : ""
                      }`}
                      className={growth.gain >= 0 ? "text-income" : "text-expense"}
                    />
                  )}
                  {growth.projectedNow != null && (
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <span className="text-muted-foreground">Worth today (est.)</span>
                      <span className="flex items-center gap-2">
                        <span className="tnum font-medium">{formatMoney(Math.round(growth.projectedNow))}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setValue(String(Math.round(growth.projectedNow!)))}
                        >
                          Use as value
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
                      Fill rate with {growth.rate.toFixed(1)}%
                    </button>
                  )}
                  {maturityValue === "" && growth.maturityValue != null && growth.maturityDerived && (
                    <button
                      type="button"
                      className="block text-primary hover:underline"
                      onClick={() => setMaturityValue(String(Math.round(growth.maturityValue!)))}
                    >
                      Fill maturity value with {formatMoney(Math.round(growth.maturityValue))}
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
              + Add deposit / growth details (rate, maturity, gain)
            </button>
          )}
          {isEdit && holding && <RecordMeta createdAt={holding.createdAt} updatedAt={holding.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Add"}
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
