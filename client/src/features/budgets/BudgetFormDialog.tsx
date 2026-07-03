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
import { categoryLabel, enumLabel } from "@/lib/i18nLabels";
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
  const { t } = useTranslation("planning");
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
    if (!amt || amt <= 0) return toast.error(t("budgetForm.invalidAmount"));
    const payload = {
      category: category === OVERALL ? null : category,
      amount: amt,
      period,
    };
    try {
      if (isEdit && budget) {
        await update.mutateAsync({ id: budget._id, ...payload });
        toast.success(t("budgetForm.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("budgetForm.created"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("budgetForm.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("budgetForm.editTitle") : t("budgetForm.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t("labels.category", { ns: "common" })}</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OVERALL}>{t("budgetForm.overallOption")}</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c._id} value={c._id}>
                    {categoryLabel(c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="budget-amt">{t("labels.amount", { ns: "common" })}</Label>
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
              <Label>{t("budgetForm.period")}</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as BudgetPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">{enumLabel("frequency", "weekly")}</SelectItem>
                  <SelectItem value="monthly">{enumLabel("frequency", "monthly")}</SelectItem>
                  <SelectItem value="yearly">{enumLabel("frequency", "yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isEdit && budget && <RecordMeta createdAt={budget.createdAt} updatedAt={budget.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? t("actions.save", { ns: "common" }) : t("actions.create", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
