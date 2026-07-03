import { useEffect, useState } from "react";
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
import { useCategories } from "@/hooks/useCategories";
import { useCreateBudget, useUpdateBudget } from "@/hooks/useBudgets";
import { RecordMeta } from "@/components/common/RecordMeta";
import type { Budget, BudgetPeriod } from "@/lib/types";

const OVERALL = "__overall__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  budget?: Budget | null;
  /** Defaults for a brand-new budget (e.g. from the active period scope or a spend suggestion). */
  defaultCategory?: string | null;
  defaultPeriod?: BudgetPeriod;
}

export function BudgetFormDialog({ open, onOpenChange, budget, defaultCategory, defaultPeriod }: Props) {
  const { data: categories } = useCategories("expense");
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const isEdit = Boolean(budget);

  const [category, setCategory] = useState<string>(OVERALL);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState<BudgetPeriod>("monthly");

  useEffect(() => {
    if (!open) return;
    setCategory(budget?.category?._id ?? defaultCategory ?? OVERALL);
    setAmount(budget ? String(budget.amount) : "");
    setPeriod(budget?.period ?? defaultPeriod ?? "monthly");
  }, [open, budget, defaultCategory, defaultPeriod]);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    const payload = {
      category: category === OVERALL ? null : category,
      amount: amt,
      period,
    };
    try {
      if (isEdit && budget) {
        await update.mutateAsync({ id: budget._id, ...payload });
        toast.success("Budget updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Budget created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit budget" : "New budget"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERALL}>Overall (all expenses)</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="budget-amt">Amount</Label>
              <Input
                id="budget-amt"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as BudgetPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="yearly">Yearly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isEdit && budget && <RecordMeta createdAt={budget.createdAt} updatedAt={budget.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
