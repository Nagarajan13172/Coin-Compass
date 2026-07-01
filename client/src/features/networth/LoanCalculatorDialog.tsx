import { useMemo, useState } from "react";
import { addMonths, format } from "date-fns";
import { AlertTriangle, TrendingDown } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/format";
import { computePayoff, formatMonths } from "@/lib/networth";
import type { Loan } from "@/lib/types";

/** "What if I pay more each month or drop a lump sum?" — reducing-balance payoff comparison. */
export function LoanCalculatorDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const [extra, setExtra] = useState("");
  const [lump, setLump] = useState("");

  const result = useMemo(() => {
    if (!loan) return null;
    const extraN = Math.max(0, Number(extra) || 0);
    const lumpN = Math.min(loan.outstanding, Math.max(0, Number(lump) || 0));
    const base = computePayoff(loan.outstanding, loan.roi, loan.emi);
    // Lump sum pays down principal now; extra raises the monthly payment.
    const boosted = computePayoff(Math.max(0, loan.outstanding - lumpN), loan.roi, loan.emi + extraN);
    const monthsSaved = base.feasible && boosted.feasible ? base.months - boosted.months : 0;
    const interestSaved =
      base.feasible && boosted.feasible ? Math.max(0, base.totalInterest - boosted.totalInterest) : 0;
    return { base, boosted, extraN, lumpN, monthsSaved, interestSaved };
  }, [loan, extra, lump]);

  if (!loan) return null;

  const hasPlan = result != null && (result.extraN > 0 || result.lumpN > 0);
  const planParts = result
    ? [
        result.lumpN > 0 ? `${formatMoney(result.lumpN)} now` : "",
        result.extraN > 0 ? `${formatMoney(result.extraN)} more each month` : "",
      ].filter(Boolean)
    : [];

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(o) => !o && (setExtra(""), setLump(""), onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Early payoff planner · {loan.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <Fact label="Outstanding" value={formatMoney(loan.outstanding)} />
            <Fact label="Rate" value={`${loan.roi}% p.a.`} />
            <Fact label="EMI" value={formatMoney(loan.emi)} />
          </div>

          {!result?.base.feasible ? (
            <div className="flex items-start gap-2 rounded-lg border border-expense/40 bg-expense/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-expense" />
              <p>
                The EMI doesn't cover the monthly interest, so the balance never reduces. Increase the EMI
                (or check the rate) to see a payoff estimate.
              </p>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="loan-extra">Extra per month</Label>
                  <Input
                    id="loan-extra"
                    type="number"
                    inputMode="decimal"
                    value={extra}
                    onChange={(e) => setExtra(e.target.value)}
                    placeholder="e.g. 5000"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="loan-lump">One-time lump sum</Label>
                  <Input
                    id="loan-lump"
                    type="number"
                    inputMode="decimal"
                    value={lump}
                    onChange={(e) => setLump(e.target.value)}
                    placeholder="e.g. 100000"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Panel
                  title="Current"
                  primary={formatMonths(result.base.months)}
                  date={endDateLabel(result.base.months)}
                  sub={`~${formatMoney(result.base.totalInterest)} interest`}
                />
                <Panel
                  title={hasPlan ? "With plan" : "With early payoff"}
                  primary={formatMonths(result.boosted.months)}
                  date={endDateLabel(result.boosted.months)}
                  sub={`~${formatMoney(result.boosted.totalInterest)} interest`}
                  highlight={hasPlan}
                />
              </div>

              {hasPlan && result.monthsSaved > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-income/40 bg-income/5 p-3 text-sm">
                  <TrendingDown className="h-4 w-4 shrink-0 text-income" />
                  <p>
                    Paying <span className="font-semibold">{planParts.join(" and ")}</span> clears it{" "}
                    <span className="font-semibold">{formatMonths(result.monthsSaved)}</span> sooner and saves about{" "}
                    <span className="font-semibold text-income">{formatMoney(result.interestSaved)}</span> in interest.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Estimate uses reducing-balance amortization; actual figures depend on your lender's schedule.
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

/** "≈ Dec 2028" projected close date from a month count. */
function endDateLabel(months: number): string | null {
  if (!isFinite(months) || months <= 0) return null;
  return `≈ ${format(addMonths(new Date(), months), "MMM yyyy")}`;
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
