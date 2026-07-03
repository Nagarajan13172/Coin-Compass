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
import { ColorPicker } from "@/components/common/ColorPicker";
import { IconPicker } from "@/components/common/IconPicker";
import { RecordMeta } from "@/components/common/RecordMeta";
import { useCreateGoal, useUpdateGoal } from "@/hooks/useGoals";
import { useSettings } from "@/hooks/useSettings";
import type { Goal } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  goal?: Goal | null;
}

export function GoalFormDialog({ open, onOpenChange, goal }: Props) {
  const { t } = useTranslation("planning");
  const { data: settings } = useSettings();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const isEdit = Boolean(goal);

  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("0");
  const [monthlyContribution, setMonthlyContribution] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [color, setColor] = useState("#6366F1");
  const [icon, setIcon] = useState("goal");

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setTargetAmount(goal ? String(goal.targetAmount) : "");
    setSavedAmount(String(goal?.savedAmount ?? 0));
    setMonthlyContribution(goal?.monthlyContribution ? String(goal.monthlyContribution) : "");
    setTargetDate(goal?.targetDate ? goal.targetDate.slice(0, 10) : "");
    setColor(goal?.color ?? "#6366F1");
    setIcon(goal?.icon ?? "goal");
  }, [open, goal]);

  async function submit() {
    if (!name.trim()) return toast.error(t("goalForm.enterName"));
    const target = Number(targetAmount) || 0;
    if (target <= 0) return toast.error(t("goalForm.enterTarget"));

    const payload = {
      name: name.trim(),
      targetAmount: target,
      savedAmount: Number(savedAmount) || 0,
      monthlyContribution: Number(monthlyContribution) || 0,
      targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      color,
      icon,
      currency: settings?.baseCurrency ?? "INR",
    };
    try {
      if (isEdit && goal) {
        await update.mutateAsync({ id: goal._id, ...payload });
        toast.success(t("goalForm.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("goalForm.created"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("goalForm.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("goalForm.editTitle") : t("goalForm.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="goal-name">{t("labels.name", { ns: "common" })}</Label>
            <Input
              id="goal-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("goalForm.namePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-target">{t("goalForm.targetAmount")}</Label>
              <Input
                id="goal-target"
                type="number"
                inputMode="decimal"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="80000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-saved">{t("goalForm.savedSoFar")}</Label>
              <Input
                id="goal-saved"
                type="number"
                inputMode="decimal"
                value={savedAmount}
                onChange={(e) => setSavedAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-monthly">{t("goalForm.monthlySaving")}</Label>
              <Input
                id="goal-monthly"
                type="number"
                inputMode="decimal"
                value={monthlyContribution}
                onChange={(e) => setMonthlyContribution(e.target.value)}
                placeholder={t("labels.optional", { ns: "common" })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-date">{t("goalForm.targetDate")}</Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("goalForm.monthlyHint")}
          </p>
          <div className="space-y-1.5">
            <Label>{t("labels.color", { ns: "common" })}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("labels.icon", { ns: "common" })}</Label>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </div>
          {isEdit && goal && <RecordMeta createdAt={goal.createdAt} updatedAt={goal.updatedAt} />}
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
