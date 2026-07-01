import { useState } from "react";
import { motion } from "motion/react";
import { Calculator, Landmark, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoanFormDialog } from "@/features/networth/LoanFormDialog";
import { LoanCalculatorDialog } from "@/features/networth/LoanCalculatorDialog";
import { useLoans, useDeleteLoan } from "@/hooks/useLoans";
import { formatMoney } from "@/lib/format";
import { LOAN_TYPE_META, computePayoff, formatMonths } from "@/lib/networth";
import type { Loan } from "@/lib/types";
import { toast } from "sonner";

export default function LoansPage() {
  const { data: loans, isLoading } = useLoans();
  const del = useDeleteLoan();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Loan | null>(null);
  const [calc, setCalc] = useState<Loan | null>(null);

  const totalOutstanding = (loans ?? [])
    .filter((l) => l.status === "active")
    .reduce((s, l) => s + l.outstanding, 0);

  function openNew() {
    setEditing(null);
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
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : loans && loans.length > 0 ? (
        <>
          <Card className="surface-gradient mb-5">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total outstanding</p>
              <p className="tnum text-3xl font-extrabold text-expense">{formatMoney(totalOutstanding)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Across {loans.filter((l) => l.status === "active").length} active loan
                {loans.filter((l) => l.status === "active").length === 1 ? "" : "s"}
              </p>
            </CardContent>
          </Card>

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
                  onEdit={() => {
                    setEditing(l);
                    setOpen(true);
                  }}
                  onDelete={() => handleDelete(l)}
                  onCalc={() => setCalc(l)}
                />
              </motion.div>
            ))}
          </div>
        </>
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
    </div>
  );
}

function LoanCard({
  loan: l,
  onEdit,
  onDelete,
  onCalc,
}: {
  loan: Loan;
  onEdit: () => void;
  onDelete: () => void;
  onCalc: () => void;
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
            value={closed ? "—" : payoff.feasible ? formatMonths(payoff.months) : "EMI too low"}
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
