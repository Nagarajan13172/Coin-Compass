import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { motion } from "motion/react";
import { addMonths, format } from "date-fns";
import { BadgeCheck, Calculator, Coins, Info, Landmark, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoanFormDialog } from "@/features/networth/LoanFormDialog";
import { LoanCalculatorDialog } from "@/features/networth/LoanCalculatorDialog";
import { useLoans, useDeleteLoan, usePayLoan, usePrecloseLoan } from "@/hooks/useLoans";
import { formatMoney } from "@/lib/format";
import { dateFnsLocale } from "@/lib/dates";
import { enumLabel } from "@/lib/i18nLabels";
import { CHART_PALETTE, LOAN_TYPE_META, computePayoff, formatMonths, prepaymentCharge } from "@/lib/networth";
import type { Loan } from "@/lib/types";
import { toast } from "sonner";

/** "3 yr 2 mo · Sep 2029" — tenure + projected close date. */
function tenureWithDate(months: number): string {
  const date =
    isFinite(months) && months > 0
      ? ` · ${format(addMonths(new Date(), months), "MMM yyyy", { locale: dateFnsLocale() })}`
      : "";
  return formatMonths(months) + date;
}

/** "15 yr 5 mo left · ETA Dec 2041" — clarifies the term is remaining, not original. */
function remainingWithEta(payoff: { feasible: boolean; months: number }, t: TFunction): string {
  if (!payoff.feasible) return t("units.emiTooLow");
  if (payoff.months <= 0) return t("units.paidOff");
  const date = format(addMonths(new Date(), payoff.months), "MMM yyyy", { locale: dateFnsLocale() });
  return `${formatMonths(payoff.months)} ${t("loanOverview.leftEta", { date })}`;
}

export default function LoansPage() {
  const { t } = useTranslation("wealth");
  const { data: loans, isLoading } = useLoans();
  const del = useDeleteLoan();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [calc, setCalc] = useState<Loan | null>(null);
  const [paying, setPaying] = useState<Loan | null>(null);
  const [preclosing, setPreclosing] = useState<Loan | null>(null);

  const active = useMemo(() => (loans ?? []).filter((l) => l.status === "active"), [loans]);

  const stats = useMemo(() => {
    const totalOutstanding = active.reduce((s, l) => s + l.outstanding, 0);
    const totalEmi = active.reduce((s, l) => s + l.emi, 0);
    // Only loans that recorded an original principal contribute to "borrowed"/"repaid" context.
    const totalPrincipal = active.reduce((s, l) => s + (l.principal > 0 ? l.principal : 0), 0);
    const knownPrincipalOutstanding = active.reduce((s, l) => s + (l.principal > 0 ? l.outstanding : 0), 0);
    const interestRemaining = active.reduce((s, l) => {
      const p = computePayoff(l.outstanding, l.roi, l.emi);
      return s + (p.feasible ? p.totalInterest : 0);
    }, 0);
    const repaid = Math.max(0, totalPrincipal - knownPrincipalOutstanding);
    const repaidPct = totalPrincipal > 0 ? Math.round((repaid / totalPrincipal) * 100) : null;
    return { totalOutstanding, totalEmi, totalPrincipal, interestRemaining, repaid, repaidPct };
  }, [active]);

  // Stable color per active loan, shared across every section so a loan reads the same everywhere.
  const loanColor = useMemo(() => {
    const map: Record<string, string> = {};
    active.forEach((l, i) => {
      map[l._id] = CHART_PALETTE[i % CHART_PALETTE.length];
    });
    return map;
  }, [active]);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(l: Loan) {
    setEditing(l);
    setOpen(true);
  }
  async function handleDelete(l: Loan) {
    if (!confirm(t("loansPage.deleteConfirm", { name: l.name }))) return;
    await del.mutateAsync(l._id);
    toast.success(t("loansPage.deleted"));
  }

  return (
    <div>
      <PageHeader
        title={t("loansPage.title")}
        description={t("loansPage.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("loansPage.addLoan")}
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : loans && loans.length > 0 ? (
        <Tabs defaultValue="overview">
          <TabsList className="mb-5">
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="loans">{t("tabs.allLoans")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <LoansOverview active={active} stats={stats} loanColor={loanColor} />
          </TabsContent>

          <TabsContent value="loans">
            <div className="grid gap-4 lg:grid-cols-2">
              {loans.map((l, i) => (
                <motion.div
                  key={l._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.03, 0.2) }}
                >
                  <LoanCard
                    loan={l}
                    color={loanColor[l._id]}
                    onEdit={() => openEdit(l)}
                    onDelete={() => handleDelete(l)}
                    onCalc={() => setCalc(l)}
                    onPay={() => setPaying(l)}
                    onPreclose={() => setPreclosing(l)}
                  />
                </motion.div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState
          icon={Landmark}
          title={t("loansPage.emptyTitle")}
          description={t("loansPage.emptyDesc")}
          action={
            <Button onClick={openNew}>
              <Plus /> {t("loansPage.addLoan")}
            </Button>
          }
        />
      )}

      <LoanFormDialog open={open} onOpenChange={setOpen} loan={editing} />
      <LoanCalculatorDialog loan={calc} onClose={() => setCalc(null)} />
      <PartPaymentDialog loan={paying} onClose={() => setPaying(null)} />
      <PrecloseDialog loan={preclosing} onClose={() => setPreclosing(null)} />
    </div>
  );
}

function PartPaymentDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const { t } = useTranslation("wealth");
  const pay = usePayLoan();
  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("");

  const outstanding = loan?.outstanding ?? 0;
  const amt = Number(amount) || 0;
  // A lump-sum prepayment goes entirely to principal; the charge is an extra fee on it.
  const chargePct = pct === "" ? loan?.foreclosureChargePct ?? 0 : Number(pct) || 0;
  const principal = Math.min(amt, outstanding);
  const charge = prepaymentCharge(principal, chargePct);
  const total = amt + charge;
  const remaining = Math.max(0, outstanding - amt);

  async function submit() {
    if (!amt || amt <= 0) return toast.error(t("partPayment.enterAmount"));
    try {
      const updated = await pay.mutateAsync({ id: loan!._id, amount: amt, chargePct });
      toast.success(
        updated.outstanding === 0
          ? t("partPayment.paidOffToast", { name: loan!.name })
          : t("partPayment.paidToast", { amount: formatMoney(amt), name: loan!.name })
      );
      setAmount("");
      setPct("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(o) => !o && (setAmount(""), setPct(""), onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("partPayment.title", { name: loan?.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="tnum text-sm text-muted-foreground">
            {t("fields.outstanding")}: <span className="font-semibold text-foreground">{formatMoney(outstanding)}</span>
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">{t("partPayment.amountToPay")}</Label>
              <Input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="10000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-charge">{t("partPayment.prepayCharge")}</Label>
              <Input
                id="pay-charge"
                type="number"
                inputMode="decimal"
                value={pct === "" ? String(loan?.foreclosureChargePct ?? "") : pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder={t("placeholders.eg2")}
              />
            </div>
          </div>
          {amt > 0 && (
            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <Row label={t("partPayment.reducesBalance")} value={formatMoney(principal)} />
              <Row label={t("partPayment.prepaymentChargePct", { pct: chargePct || 0 })} value={formatMoney(charge)} />
              <div className="mt-1 flex items-center justify-between border-t pt-1.5">
                <span className="font-medium">{t("partPayment.totalYouPay")}</span>
                <span className="tnum font-bold">{formatMoney(total)}</span>
              </div>
              <p className="tnum pt-1 text-xs text-muted-foreground">
                {t("partPayment.outstandingAfter", { amount: formatMoney(remaining) })}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={pay.isPending}>
            {t("partPayment.pay")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrecloseDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const { t } = useTranslation("wealth");
  const preclose = usePrecloseLoan();
  const [pct, setPct] = useState("");

  // default the charge % from the loan when it opens
  const chargePct = pct === "" ? loan?.foreclosureChargePct ?? 0 : Number(pct) || 0;
  const outstanding = loan?.outstanding ?? 0;
  const charge = prepaymentCharge(outstanding, chargePct);
  const total = outstanding + charge;

  async function submit() {
    try {
      await preclose.mutateAsync({ id: loan!._id, chargePct });
      toast.success(t("preclose.toast", { name: loan!.name }));
      setPct("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(o) => !o && (setPct(""), onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("preclose.title", { name: loan?.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("preclose.desc")}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="preclose-pct">{t("preclose.charge")}</Label>
            <Input
              id="preclose-pct"
              type="number"
              inputMode="decimal"
              value={pct === "" ? String(loan?.foreclosureChargePct ?? "") : pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder={t("placeholders.eg2")}
            />
          </div>
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <Row label={t("fields.outstanding")} value={formatMoney(outstanding)} />
            <Row label={t("preclose.chargePct", { pct: chargePct || 0 })} value={formatMoney(charge)} />
            <div className="mt-1 flex items-center justify-between border-t pt-1.5">
              <span className="font-medium">{t("preclose.totalPayable")}</span>
              <span className="tnum font-bold">{formatMoney(total)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={preclose.isPending}>
            {t("preclose.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
}

// ---- Overview ----

function LoansOverview({
  active,
  stats,
  loanColor,
}: {
  active: Loan[];
  stats: {
    totalOutstanding: number;
    totalEmi: number;
    totalPrincipal: number;
    interestRemaining: number;
    repaid: number;
    repaidPct: number | null;
  };
  loanColor: Record<string, string>;
}) {
  const { t } = useTranslation("wealth");
  if (!active.length) {
    return (
      <EmptyState
        icon={Landmark}
        title={t("loanOverview.emptyTitle")}
        description={t("loanOverview.emptyDesc")}
      />
    );
  }
  const count = t("loanOverview.activeLoans", { count: active.length });
  const outstandingSub =
    stats.repaidPct != null
      ? t("loanOverview.repaidOf", {
          pct: stats.repaidPct,
          amount: formatMoney(stats.totalPrincipal, { compact: stats.totalPrincipal > 99999 }),
        })
      : count;
  // Largest first so the biggest balance stands out at the top of the bar chart.
  const byOutstanding = [...active].sort((a, b) => b.outstanding - a.outstanding);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("loanOverview.totalOutstanding")} tone="expense" value={formatMoney(stats.totalOutstanding)} sub={outstandingSub} />
        <Stat label={t("loanOverview.monthlyEmi")} value={formatMoney(stats.totalEmi)} sub={t("loanOverview.totalAcross", { loans: count })} />
        <Stat
          label={t("loanOverview.interestRemaining")}
          tone="expense"
          value={`~${formatMoney(stats.interestRemaining)}`}
          sub={t("loanOverview.atCurrentRates")}
          info={t("loanOverview.interestRemainingHelp")}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("loanOverview.outstandingByLoan")}</CardTitle>
            <CardDescription>{t("loanOverview.outstandingShareDesc", { total: formatMoney(stats.totalOutstanding) })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3.5">
              {byOutstanding.map((l) => {
                const share = stats.totalOutstanding > 0 ? (l.outstanding / stats.totalOutstanding) * 100 : 0;
                const color = loanColor[l._id];
                return (
                  <li key={l._id} className="space-y-1.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">{Math.round(share)}%</span>
                      <span className="tnum shrink-0 font-semibold">{formatMoney(l.outstanding)}</span>
                    </div>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-secondary"
                      role="progressbar"
                      aria-valuenow={Math.round(share)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={t("loanOverview.shareAria", { name: l.name, pct: Math.round(share) })}
                    >
                      <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">{t("loanOverview.payoffProgress")}</CardTitle>
            <CardDescription>{t("loanOverview.payoffProgressDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {active.map((l) => {
              const paid = l.principal > 0 ? Math.max(0, l.principal - l.outstanding) : 0;
              const pct = l.principal > 0 ? Math.min(100, Math.round((paid / l.principal) * 100)) : null;
              const payoff = computePayoff(l.outstanding, l.roi, l.emi);
              return (
                <div key={l._id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: loanColor[l._id] }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    <span className="tnum shrink-0 text-xs text-muted-foreground">
                      {l.roi}% · {l.emi ? t("units.perMonth", { amount: formatMoney(l.emi) }) : t("loanOverview.noEmi")}
                    </span>
                  </div>
                  {pct != null && <Progress value={pct} indicatorClassName="bg-income" />}
                  <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-xs text-muted-foreground tnum">
                    <span>
                      {pct != null
                        ? t("loanOverview.paidLeftOf", { pct, left: formatMoney(l.outstanding), principal: formatMoney(l.principal) })
                        : t("loanOverview.leftAddOriginal", { left: formatMoney(l.outstanding) })}
                    </span>
                    <span>{remainingWithEta(payoff, t)}</span>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
  info,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "expense";
  info?: string;
}) {
  const { t } = useTranslation("wealth");
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <span>{label}</span>
          {info && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={t("loanOverview.howCalculated", { label: label.toLowerCase() })}
                  className="inline-flex text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-pretty">{info}</TooltipContent>
            </Tooltip>
          )}
        </div>
        <p className={`tnum text-2xl font-bold ${tone === "expense" ? "text-expense" : ""}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ---- Loan card (All loans tab) ----

function LoanCard({
  loan: l,
  color,
  onEdit,
  onDelete,
  onCalc,
  onPay,
  onPreclose,
}: {
  loan: Loan;
  color?: string;
  onEdit: () => void;
  onDelete: () => void;
  onCalc: () => void;
  onPay: () => void;
  onPreclose: () => void;
}) {
  const { t } = useTranslation("wealth");
  const payoff = computePayoff(l.outstanding, l.roi, l.emi);
  const closed = l.status === "closed";
  // Active loans reuse their overview color; closed loans fall back to a neutral slate.
  const iconColor = color ?? "#94A3B8";
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={LOAN_TYPE_META[l.type].icon} color={iconColor} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{l.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {enumLabel("loan", l.type)}
              {l.lender ? ` · ${l.lender}` : ""}
            </p>
          </div>
          {closed ? <Badge variant="income">{t("status.closed")}</Badge> : <Badge variant="expense">{t("status.active")}</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("loanCard.actionsAria")}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCalc}>
                <Calculator /> {t("loanCard.payoffPlanner")}
              </DropdownMenuItem>
              {!closed && (
                <DropdownMenuItem onClick={onPay}>
                  <Coins /> {t("loanCard.partPayment")}
                </DropdownMenuItem>
              )}
              {!closed && (
                <DropdownMenuItem onClick={onPreclose}>
                  <BadgeCheck /> {t("loanCard.preclose")}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> {t("actions.edit", { ns: "common" })}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> {t("actions.delete", { ns: "common" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field label={t("fields.outstanding")} value={formatMoney(l.outstanding)} strong />
          <Field label={t("fields.emi")} value={l.emi ? formatMoney(l.emi) : "—"} />
          <Field label={t("fields.interest")} value={t("units.perAnnum", { rate: l.roi })} />
          <Field
            label={t("fields.tenureLeft")}
            value={closed ? "—" : payoff.feasible ? tenureWithDate(payoff.months) : t("units.emiTooLow")}
          />
        </div>

        {l.tenureMonths ? (
          <p className="text-xs text-muted-foreground">
            {t("loanCard.originalTenure", { tenure: formatMonths(l.tenureMonths) })}
            {l.startDate ? ` ${t("loanCard.fromMonth", { date: format(new Date(l.startDate), "MMM yyyy", { locale: dateFnsLocale() }) })}` : ""}
            {l.endDate ? ` ${t("loanCard.toMonth", { date: format(new Date(l.endDate), "MMM yyyy", { locale: dateFnsLocale() }) })}` : ""}
          </p>
        ) : null}

        {((l.interestPaid ?? 0) > 0 || (l.chargesPaid ?? 0) > 0) && (
          <p className="text-xs text-muted-foreground">
            {t("loanCard.interestPaidSoFar")}:{" "}
            <span className="tnum font-medium text-expense">{formatMoney(l.interestPaid ?? 0)}</span>
            {(l.chargesPaid ?? 0) > 0 && (
              <>
                {" "}· {t("loanCard.charges")} <span className="tnum font-medium">{formatMoney(l.chargesPaid)}</span>
              </>
            )}
          </p>
        )}

        {!closed && (
          <Button variant="outline" size="sm" className="w-full" onClick={onCalc}>
            <Calculator /> {t("loanCard.payoffPlanner")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tnum ${strong ? "font-semibold" : "font-medium"}`}>{value}</p>
    </div>
  );
}
