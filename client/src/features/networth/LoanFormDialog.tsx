import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, format } from "date-fns";
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
import { AmountInput } from "@/components/common/AmountInput";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateLoan, useUpdateLoan } from "@/hooks/useLoans";
import { useSettings } from "@/hooks/useSettings";
import { LOAN_TYPE_META, computePayoff, formatMonths } from "@/lib/networth";
import { formatMoney } from "@/lib/format";
import { dateFnsLocale } from "@/lib/dates";
import { enumLabel } from "@/lib/i18nLabels";
import { RecordMeta } from "@/components/common/RecordMeta";
import type { Loan, LoanStatus, LoanType } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  loan?: Loan | null;
}

const LOAN_TYPE_ENTRIES = Object.entries(LOAN_TYPE_META) as [LoanType, { label: string }][];

/** The typical prepay/preclose charge for a loan type, as an input string ("" when nil). */
function chargeDefault(type: LoanType): string {
  const pct = LOAN_TYPE_META[type].typicalChargePct;
  return pct ? String(pct) : "";
}

export function LoanFormDialog({ open, onOpenChange, loan }: Props) {
  const { t } = useTranslation("wealth");
  const { data: settings } = useSettings();
  const create = useCreateLoan();
  const update = useUpdateLoan();
  const isEdit = Boolean(loan);

  const [name, setName] = useState("");
  const [lender, setLender] = useState("");
  const [type, setType] = useState<LoanType>("personal");
  const [outstanding, setOutstanding] = useState("");
  const [principal, setPrincipal] = useState("");
  const [roi, setRoi] = useState("");
  const [emi, setEmi] = useState("");
  const [foreclosureChargePct, setForeclosureChargePct] = useState("");
  // Track whether the user has hand-edited the charge, so switching loan type
  // only re-seeds a default they haven't touched.
  const [chargeTouched, setChargeTouched] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [tenureMonths, setTenureMonths] = useState("");
  const [status, setStatus] = useState<LoanStatus>("active");

  // End date auto-derives from start + tenure; the projected payoff derives from
  // the balance + EMI + rate, so it reflects any (incl. recurring) payments made.
  const derivedEnd = useMemo(() => {
    const months = Number(tenureMonths);
    if (!startDate || !months) return null;
    const d = new Date(startDate);
    return Number.isNaN(d.getTime()) ? null : addMonths(d, months);
  }, [startDate, tenureMonths]);

  const payoff = useMemo(() => {
    const out = Number(outstanding) || 0;
    const monthly = Number(emi) || 0;
    if (out <= 0 || monthly <= 0) return null;
    return computePayoff(out, Number(roi) || 0, monthly);
  }, [outstanding, emi, roi]);

  useEffect(() => {
    if (!open) return;
    setName(loan?.name ?? "");
    setLender(loan?.lender ?? "");
    setType(loan?.type ?? "personal");
    setOutstanding(loan ? String(loan.outstanding) : "");
    setPrincipal(loan?.principal ? String(loan.principal) : "");
    setRoi(loan?.roi ? String(loan.roi) : "");
    setEmi(loan?.emi ? String(loan.emi) : "");
    // Existing loan keeps its saved charge; a new one is seeded from its type's typical rate.
    setForeclosureChargePct(
      loan ? (loan.foreclosureChargePct ? String(loan.foreclosureChargePct) : "") : chargeDefault("personal")
    );
    setChargeTouched(false);
    setStartDate(loan?.startDate ? loan.startDate.slice(0, 10) : "");
    setTenureMonths(loan?.tenureMonths ? String(loan.tenureMonths) : "");
    setStatus(loan?.status ?? "active");
  }, [open, loan]);

  // Picking a type re-seeds the charge default (new loans only, until edited by hand).
  function onTypeChange(v: LoanType) {
    setType(v);
    if (!isEdit && !chargeTouched) setForeclosureChargePct(chargeDefault(v));
  }

  async function submit() {
    if (!name.trim()) return toast.error(t("loanForm.enterName"));
    const out = Number(outstanding);
    if (!(out >= 0)) return toast.error(t("loanForm.enterOutstanding"));
    const payload = {
      name: name.trim(),
      lender: lender.trim(),
      type,
      outstanding: out,
      principal: Number(principal) || 0,
      roi: Number(roi) || 0,
      emi: Number(emi) || 0,
      foreclosureChargePct: Number(foreclosureChargePct) || 0,
      tenureMonths: Number(tenureMonths) || null,
      startDate: startDate ? new Date(startDate).toISOString() : null,
      status,
      currency: settings?.baseCurrency ?? "INR",
    };
    try {
      if (isEdit && loan) {
        await update.mutateAsync({ id: loan._id, ...payload });
        toast.success(t("loanForm.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("loanForm.added"));
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
          <DialogTitle>{isEdit ? t("loanForm.editTitle") : t("loanForm.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-name">{t("labels.name", { ns: "common" })}</Label>
              <Input id="loan-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("loanForm.namePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-lender">{t("loanForm.provider")}</Label>
              <Input id="loan-lender" value={lender} onChange={(e) => setLender(e.target.value)} placeholder="HDFC" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("labels.type", { ns: "common" })}</Label>
              <Select value={type} onValueChange={(v) => onTypeChange(v as LoanType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_TYPE_ENTRIES.map(([value]) => (
                    <SelectItem key={value} value={value}>
                      {enumLabel("loan", value)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("labels.status", { ns: "common" })}</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as LoanStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t("status.active")}</SelectItem>
                  <SelectItem value="closed">{t("status.closed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-out">{t("fields.outstanding")}</Label>
              <AmountInput id="loan-out" value={outstanding} onChange={setOutstanding} placeholder="5,00,000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-principal">{t("loanForm.originalAmount")}</Label>
              <AmountInput id="loan-principal" value={principal} onChange={setPrincipal} placeholder={t("labels.optional", { ns: "common" })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-roi">{t("loanForm.interestRate")}</Label>
              <Input id="loan-roi" type="number" inputMode="decimal" value={roi} onChange={(e) => setRoi(e.target.value)} placeholder="8.5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-emi">{t("loanForm.monthlyEmi")}</Label>
              <AmountInput id="loan-emi" value={emi} onChange={setEmi} placeholder="12,000" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-foreclose">{t("loanForm.prepayPrecloseCharge")}</Label>
              <Input
                id="loan-foreclose"
                type="number"
                inputMode="decimal"
                value={foreclosureChargePct}
                onChange={(e) => {
                  setForeclosureChargePct(e.target.value);
                  setChargeTouched(true);
                }}
                placeholder={t("placeholders.eg2")}
              />
              <p className="text-xs text-muted-foreground">
                {t("loanForm.typicalCharge", { type: enumLabel("loan", type).toLowerCase(), pct: LOAN_TYPE_META[type].typicalChargePct })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-start">{t("labels.startDate", { ns: "common" })}</Label>
              <Input id="loan-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-tenure">{t("loanForm.tenureMonths")}</Label>
              <Input
                id="loan-tenure"
                type="number"
                inputMode="numeric"
                min={0}
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
                placeholder={t("placeholders.eg60")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("labels.endDate", { ns: "common" })}</Label>
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {derivedEnd ? format(derivedEnd, "dd MMM yyyy", { locale: dateFnsLocale() }) : t("loanForm.setStartTenure")}
              </div>
            </div>
          </div>
          {payoff && (
            <p className="text-xs text-muted-foreground">
              {t("loanForm.payoffPrefix", { rate: formatMoney(Number(emi) || 0) })}{" "}
              {payoff.feasible ? (
                <>
                  {t("loanForm.clearsInPre")}{" "}
                  <span className="font-medium text-foreground">{formatMonths(payoff.months)}</span>
                  {t("loanForm.clearsInPost")}
                </>
              ) : (
                <span className="text-expense">{t("loanForm.emiTooLowLong")}</span>
              )}
            </p>
          )}
          {isEdit && loan && <RecordMeta createdAt={loan.createdAt} updatedAt={loan.updatedAt} />}
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
