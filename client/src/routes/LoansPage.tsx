import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { addMonths, format } from "date-fns";
import { BadgeCheck, Calculator, Coins, Landmark, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
import { CategoryDonut } from "@/features/reports/CategoryDonut";
import { LoanFormDialog } from "@/features/networth/LoanFormDialog";
import { LoanCalculatorDialog } from "@/features/networth/LoanCalculatorDialog";
import { useLoans, useDeleteLoan, usePayLoan, usePrecloseLoan } from "@/hooks/useLoans";
import { formatMoney } from "@/lib/format";
import { CHART_PALETTE, LOAN_TYPE_META, computePayoff, formatMonths } from "@/lib/networth";
import type { CategoryDatum, Loan } from "@/lib/types";
import { toast } from "sonner";

/** "3 yr 2 mo · Sep 2029" — tenure + projected close date. */
function tenureWithDate(months: number): string {
  const date = isFinite(months) && months > 0 ? ` · ${format(addMonths(new Date(), months), "MMM yyyy")}` : "";
  return formatMonths(months) + date;
}

export default function LoansPage() {
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
    const interestRemaining = active.reduce((s, l) => {
      const p = computePayoff(l.outstanding, l.roi, l.emi);
      return s + (p.feasible ? p.totalInterest : 0);
    }, 0);
    return { totalOutstanding, totalEmi, interestRemaining };
  }, [active]);

  // Donut: outstanding balance by loan.
  const donutData: CategoryDatum[] = useMemo(
    () =>
      active.map((l, i) => ({
        categoryId: l._id,
        name: l.name,
        color: CHART_PALETTE[i % CHART_PALETTE.length],
        icon: LOAN_TYPE_META[l.type].icon,
        total: l.outstanding,
        count: 0,
        percent: stats.totalOutstanding > 0 ? Math.round((l.outstanding / stats.totalOutstanding) * 100) : 0,
      })),
    [active, stats.totalOutstanding]
  );

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(l: Loan) {
    setEditing(l);
    setOpen(true);
  }
  async function handleDelete(l: Loan) {
    if (!confirm(`Delete loan "${l.name}"?`)) return;
    await del.mutateAsync(l._id);
    toast.success("Loan deleted");
  }

  return (
    <div>
      <PageHeader
        title="Loans"
        description="Track balances and plan an early payoff"
        actions={
          <Button onClick={openNew}>
            <Plus /> Add loan
          </Button>
        }
      />

      {isLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : loans && loans.length > 0 ? (
        <Tabs defaultValue="overview">
          <TabsList className="mb-5">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="loans">All loans</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <LoansOverview active={active} stats={stats} donutData={donutData} />
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
          title="No loans yet"
          description="Add your loans to track outstanding balances and plan an early payoff."
          action={
            <Button onClick={openNew}>
              <Plus /> Add loan
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
  const pay = usePayLoan();
  const [amount, setAmount] = useState("");

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    try {
      const updated = await pay.mutateAsync({ id: loan!._id, amount: n });
      toast.success(
        updated.outstanding === 0 ? `${loan!.name} fully paid off 🎉` : `Paid ${formatMoney(n)} towards ${loan!.name}`
      );
      setAmount("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const remaining = loan ? Math.max(0, loan.outstanding - (Number(amount) || 0)) : 0;

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Part payment · {loan?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="tnum text-sm text-muted-foreground">
            Outstanding: <span className="font-semibold text-foreground">{formatMoney(loan?.outstanding ?? 0)}</span>
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">Amount to pay</Label>
            <Input
              id="pay-amount"
              type="number"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="10000"
            />
          </div>
          {Number(amount) > 0 && (
            <p className="tnum text-sm text-muted-foreground">
              Remaining after: <span className="font-semibold text-foreground">{formatMoney(remaining)}</span>
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pay.isPending}>
            Pay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PrecloseDialog({ loan, onClose }: { loan: Loan | null; onClose: () => void }) {
  const preclose = usePrecloseLoan();
  const [pct, setPct] = useState("");

  // default the charge % from the loan when it opens
  const chargePct = pct === "" ? loan?.foreclosureChargePct ?? 0 : Number(pct) || 0;
  const outstanding = loan?.outstanding ?? 0;
  const charge = Math.round(outstanding * (chargePct / 100));
  const total = outstanding + charge;

  async function submit() {
    try {
      await preclose.mutateAsync({ id: loan!._id, chargePct });
      toast.success(`${loan!.name} preclosed`);
      setPct("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Dialog open={Boolean(loan)} onOpenChange={(o) => !o && (setPct(""), onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Preclose · {loan?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Pay off the full balance now and close the loan. Banks usually charge a foreclosure fee.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="preclose-pct">Preclosure charge (%)</Label>
            <Input
              id="preclose-pct"
              type="number"
              inputMode="decimal"
              value={pct === "" ? String(loan?.foreclosureChargePct ?? "") : pct}
              onChange={(e) => setPct(e.target.value)}
              placeholder="e.g. 2"
            />
          </div>
          <div className="space-y-1 rounded-lg border p-3 text-sm">
            <Row label="Outstanding" value={formatMoney(outstanding)} />
            <Row label={`Charge (${chargePct || 0}%)`} value={formatMoney(charge)} />
            <div className="mt-1 flex items-center justify-between border-t pt-1.5">
              <span className="font-medium">Total payable</span>
              <span className="tnum font-bold">{formatMoney(total)}</span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={preclose.isPending}>
            Preclose &amp; mark closed
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
  donutData,
}: {
  active: Loan[];
  stats: { totalOutstanding: number; totalEmi: number; interestRemaining: number };
  donutData: CategoryDatum[];
}) {
  if (!active.length) {
    return (
      <EmptyState
        icon={Landmark}
        title="No active loans"
        description="All your loans are marked closed — nothing outstanding. 🎉"
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total outstanding" tone="expense" value={formatMoney(stats.totalOutstanding)} sub={`${active.length} active loan${active.length === 1 ? "" : "s"}`} />
        <Stat label="Monthly EMI" value={formatMoney(stats.totalEmi)} sub="Total across active loans" />
        <Stat label="Interest remaining" tone="expense" value={`~${formatMoney(stats.interestRemaining)}`} sub="At current EMIs" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Outstanding by loan</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryDonut data={donutData} total={stats.totalOutstanding} centerLabel="Outstanding" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payoff progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {active.map((l, i) => {
              const paid = l.principal > 0 ? Math.max(0, l.principal - l.outstanding) : 0;
              const pct = l.principal > 0 ? Math.min(100, Math.round((paid / l.principal) * 100)) : null;
              const payoff = computePayoff(l.outstanding, l.roi, l.emi);
              return (
                <div key={l._id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: CHART_PALETTE[i % CHART_PALETTE.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    <span className="tnum text-xs text-muted-foreground">
                      {payoff.feasible ? tenureWithDate(payoff.months) : "EMI too low"}
                    </span>
                  </div>
                  {pct == null ? (
                    <p className="tnum text-xs text-muted-foreground">
                      {formatMoney(l.outstanding)} outstanding · add the original amount to see % paid
                    </p>
                  ) : (
                    <>
                      <Progress value={pct} indicatorClassName="bg-income" />
                      <div className="flex justify-between text-xs text-muted-foreground tnum">
                        <span>{pct}% paid</span>
                        <span>{formatMoney(l.outstanding)} left of {formatMoney(l.principal)}</span>
                      </div>
                    </>
                  )}
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
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "expense";
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`tnum text-2xl font-bold ${tone === "expense" ? "text-expense" : ""}`}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

// ---- Loan card (All loans tab) ----

function LoanCard({
  loan: l,
  onEdit,
  onDelete,
  onCalc,
  onPay,
  onPreclose,
}: {
  loan: Loan;
  onEdit: () => void;
  onDelete: () => void;
  onCalc: () => void;
  onPay: () => void;
  onPreclose: () => void;
}) {
  const payoff = computePayoff(l.outstanding, l.roi, l.emi);
  const closed = l.status === "closed";
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <CategoryIcon icon={LOAN_TYPE_META[l.type].icon} color="#EF4444" size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{l.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {LOAN_TYPE_META[l.type].label}
              {l.lender ? ` · ${l.lender}` : ""}
            </p>
          </div>
          {closed ? <Badge variant="income">Closed</Badge> : <Badge variant="expense">Active</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Loan actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onCalc}>
                <Calculator /> Payoff calculator
              </DropdownMenuItem>
              {!closed && (
                <DropdownMenuItem onClick={onPay}>
                  <Coins /> Part payment
                </DropdownMenuItem>
              )}
              {!closed && (
                <DropdownMenuItem onClick={onPreclose}>
                  <BadgeCheck /> Preclose
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Field label="Outstanding" value={formatMoney(l.outstanding)} strong />
          <Field label="EMI" value={l.emi ? formatMoney(l.emi) : "—"} />
          <Field label="Interest" value={`${l.roi}% p.a.`} />
          <Field
            label="Tenure left"
            value={closed ? "—" : payoff.feasible ? tenureWithDate(payoff.months) : "EMI too low"}
          />
        </div>

        {!closed && (
          <Button variant="outline" size="sm" className="w-full" onClick={onCalc}>
            <Calculator /> Payoff calculator
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
