import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowRight } from "lucide-react";
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
import { usePostRecurringOne } from "@/hooks/useRecurring";
import { categoryLabel, enumLabel } from "@/lib/i18nLabels";
import type { Recurring } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

/**
 * Confirm-and-post dialog for a recurring rule. Pre-fills the rule's amount and
 * next date but lets the user tweak them (e.g. a partial payment or a date shift)
 * before posting. On confirm, one transaction is created and the schedule advances.
 */
export function PostRecurringDialog({ rule, onClose }: { rule: Recurring | null; onClose: () => void }) {
  const { t } = useTranslation("recurring");
  const post = usePostRecurringOne();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    if (!rule) return;
    setAmount(String(rule.amount));
    setDate(format(new Date(rule.nextRun), "yyyy-MM-dd"));
  }, [rule]);

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error(t("post.errors.amount"));
    try {
      await post.mutateAsync({ id: rule!._id, amount: n, date: new Date(date).toISOString() });
      toast.success(t("post.toast.posted"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("post.toast.failed"));
    }
  }

  const title = rule
    ? rule.type === "transfer"
      ? t("txnType.transfer", { ns: "common" })
      : rule.category?.name
        ? categoryLabel(rule.category.name)
        : rule.note || t("post.fallbackTitle")
    : "";

  return (
    <Dialog open={Boolean(rule)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("post.dialogTitle", { title })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("post.description", {
              frequency: rule ? enumLabel("frequency", rule.frequency).toLowerCase() : "",
              type: rule ? t(`txnType.${rule.type}`, { ns: "common" }).toLowerCase() : "",
            })}
          </p>
          {rule?.loan && (
            <p className="rounded-lg border border-income/40 bg-income/5 p-2.5 text-xs">
              {t("post.loanNotePrefix")} <span className="font-semibold">{rule.loan.name}</span>
              {t("post.loanNoteSuffix")}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="post-amount">{t("labels.amount", { ns: "common" })}</Label>
              <AmountInput
                id="post-amount"
                autoFocus
                value={amount}
                onChange={setAmount}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-date">{t("labels.date", { ns: "common" })}</Label>
              <Input id="post-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          {rule && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              {rule.account?.name}
              {rule.type === "transfer" && rule.toAccount && (
                <>
                  <ArrowRight className="h-3 w-3" /> {rule.toAccount.name}
                </>
              )}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={post.isPending}>
            {t("post.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
