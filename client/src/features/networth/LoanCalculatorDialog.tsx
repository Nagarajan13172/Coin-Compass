import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addMonths, format } from "date-fns";
import { AlertTriangle, TrendingDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/common/AmountInput";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { dateFnsLocale } from "@/lib/dates";
import { computePayoff, formatMonths, prepaymentCharge } from "@/lib/networth";
import type { Loan } from "@/lib/types";

/** "What if I pay more each month or drop a lump sum?" — reducing-balance payoff comparison. */
export function LoanCalculatorDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const { t } = useTranslation("wealth");
  const [extra, setExtra] = useState("");
  const [lump, setLump] = useState("");
  const [pct, setPct] = useState("");

  const result = useMemo(() => {
    if (!loan) return null;
    const extraN = Math.max(0, Number(extra) || 0);
    const lumpN = Math.min(loan.outstanding, Math.max(0, Number(lump) || 0));
    // Prepayment charge % — default to the loan's own rate, overridable for what-ifs.
    const chargePctN = pct === "" ? loan.foreclosureChargePct ?? 0 : Math.max(0, Number(pct) || 0);
    const base = computePayoff(loan.outstanding, loan.roi, loan.emi);
    // Lump sum pays down principal now; extra raises the monthly payment.
    const boosted = computePayoff(Math.max(0, loan.outstanding - lumpN), loan.roi, loan.emi + extraN);
    const monthsSaved = base.feasible && boosted.feasible ? base.months - boosted.months : 0;
    const interestSaved =
      base.feasible && boosted.feasible ? Math.max(0, base.totalInterest - boosted.totalInterest) : 0;
    // Lenders levy the fee on the prepaid (lump-sum) amount; a higher monthly EMI carries none.
    // Same helper the Part-payment/Preclose flows use, so the projection matches what's recorded.
    const charge = prepaymentCharge(lumpN, chargePctN);
    const netSaved = interestSaved - charge;
    return { base, boosted, extraN, lumpN, chargePctN, charge, monthsSaved, interestSaved, netSaved };
  }, [loan, extra, lump, pct]);

  if (!loan) return null;

  const hasPlan = result != null && (result.extraN > 0 || result.lumpN > 0);
  const planParts = result
    ? [
        result.lumpN > 0 ? t("planner.planNow", { amount: formatMoney(result.lumpN) }) : "",
        result.extraN > 0 ? t("planner.planMore", { amount: formatMoney(result.extraN) }) : "",
      ].filter(Boolean)
    : [];
  // A charged prepayment that saves less interest than it costs isn't worth it.
  const notWorth = Boolean(result && result.charge > 0 && result.netSaved <= 0);

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(o) => !o && (setExtra(""), setLump(""), setPct(""), onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("planner.title", { name: loan.name })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Fact label={t("fields.outstanding")} value={formatMoney(loan.outstanding)} />
            <Fact label={t("fields.rate")} value={t("units.perAnnum", { rate: loan.roi })} />
            <Fact label={t("fields.emi")} value={formatMoney(loan.emi)} />
          </div>

          {!result?.base.feasible ? (
            <div className="flex items-start gap-2 rounded-lg border border-expense/40 bg-expense/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-expense" />
              <p>
                {t("planner.notFeasible")}
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="loan-extra">{t("planner.extraPerMonth")}</Label>
                  <AmountInput
                    id="loan-extra"
                    value={extra}
                    onChange={setExtra}
                    placeholder={t("placeholders.eg5000")}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loan-lump">{t("planner.lumpSum")}</Label>
                  <AmountInput
                    id="loan-lump"
                    value={lump}
                    onChange={setLump}
                    placeholder={t("placeholders.eg100000")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="loan-charge">{t("planner.prepaymentChargeOnLump")}</Label>
                <Input
                  id="loan-charge"
                  type="number"
                  inputMode="decimal"
                  value={pct === "" ? String(loan.foreclosureChargePct ?? "") : pct}
                  onChange={(e) => setPct(e.target.value)}
                  placeholder={t("placeholders.eg2")}
                />
                <p className="text-xs text-muted-foreground">
                  {t("planner.chargeHelp")}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Panel
                  title={t("planner.current")}
                  primary={formatMonths(result.base.months)}
                  date={endDateLabel(result.base.months)}
                  sub={t("planner.interestSub", { amount: formatMoney(result.base.totalInterest) })}
                />
                <Panel
                  title={hasPlan ? t("planner.withPlan") : t("planner.withEarlyPayoff")}
                  primary={formatMonths(result.boosted.months)}
                  date={endDateLabel(result.boosted.months)}
                  sub={t("planner.interestSub", { amount: formatMoney(result.boosted.totalInterest) })}
                  highlight={hasPlan}
                />
              </div>

              {hasPlan && (result.monthsSaved > 0 || result.interestSaved > 0) && (
                <div
                  className={`rounded-lg border p-3 text-sm ${
                    notWorth ? "border-amber-500/40 bg-amber-500/5" : "border-income/40 bg-income/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {notWorth ? (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    ) : (
                      <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-income" />
                    )}
                    <p>
                      {t("planner.payingPre")}{" "}
                      <span className="font-semibold">{planParts.join(` ${t("planner.and")} `)}</span>
                      {result.monthsSaved > 0 ? (
                        <>
                          {" "}
                          {t("planner.clearsItPre")}{" "}
                          <span className="font-semibold">{formatMonths(result.monthsSaved)}</span>{" "}
                          {t("planner.clearsItPost")}
                        </>
                      ) : (
                        "."
                      )}
                    </p>
                  </div>

                  {result.charge > 0 ? (
                    <div className="mt-2.5 space-y-1 border-t pt-2.5">
                      <CalcRow label={t("planner.interestSaved")} value={`+${formatMoney(result.interestSaved)}`} tone="income" />
                      <CalcRow
                        label={t("planner.prepaymentChargePct", { pct: result.chargePctN })}
                        value={`−${formatMoney(result.charge)}`}
                        tone="expense"
                      />
                      <div className="flex items-center justify-between border-t pt-1.5 font-medium">
                        <span>{t("planner.netBenefit")}</span>
                        <span className={`tnum font-bold ${result.netSaved >= 0 ? "text-income" : "text-expense"}`}>
                          {result.netSaved < 0 ? "−" : ""}
                          {formatMoney(Math.abs(result.netSaved))}
                        </span>
                      </div>
                      {notWorth && (
                        <p className="pt-1 text-xs text-muted-foreground">
                          {t("planner.notWorth")}
                        </p>
                      )}
                    </div>
                  ) : (
                    result.interestSaved > 0 && (
                      <p className="mt-1.5">
                        {t("planner.savesAboutPre")}{" "}
                        <span className="font-semibold text-income">{formatMoney(result.interestSaved)}</span>{" "}
                        {t("planner.savesAboutPost")}
                      </p>
                    )
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("planner.estimateNote")}
              </p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum truncate font-semibold">{value}</p>
    </div>
  );
}

/** A labelled +/− line in the net-benefit breakdown. */
function CalcRow({ label, value, tone }: { label: string; value: string; tone: "income" | "expense" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`tnum ${tone === "income" ? "text-income" : "text-expense"}`}>{value}</span>
    </div>
  );
}

/** "≈ Dec 2028" projected close date from a month count. */
function endDateLabel(months: number): string | null {
  if (!isFinite(months) || months <= 0) return null;
  return `≈ ${format(addMonths(new Date(), months), "MMM yyyy", { locale: dateFnsLocale() })}`;
}

function Panel({
  title,
  primary,
  date,
  sub,
  highlight,
}: {
  title: string;
  primary: string;
  date: string | null;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? "border-income/40 bg-income/5" : ""}`}>
      <p className="text-xs text-muted-foreground">{title}</p>
      <p className="text-lg font-bold">{primary}</p>
      {date && <p className="text-xs font-medium text-foreground">{date}</p>}
      <p className="tnum text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
