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
import { Label } from "@/components/ui/label";
import { usePostRecurringOne } from "@/hooks/useRecurring";
import type { Recurring } from "@/lib/types";
import { toast } from "sonner";

/**
 * Confirm-and-post dialog for a recurring rule. Pre-fills the rule's amount and
 * next date but lets the user tweak them (e.g. a partial payment or a date shift)
 * before posting. On confirm, one transaction is created and the schedule advances.
 */
export function PostRecurringDialog({ rule, onClose }: { rule: Recurring | null; onClose: () => void }) {
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
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    try {
      await post.mutateAsync({ id: rule!._id, amount: n, date: new Date(date).toISOString() });
      toast.success("Transaction posted");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to post");
    }
  }

  const title = rule
    ? rule.type === "transfer"
      ? "Transfer"
      : rule.category?.name ?? (rule.note || "Recurring")
    : "";

  return (
    <Dialog open={Boolean(rule)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Post · {title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Confirm the amount and date, then post this {rule?.frequency} {rule?.type}. The transaction is
            linked to the rule and the schedule moves to the next occurrence.
          </p>
          {rule?.loan && (
            <p className="rounded-lg border border-income/40 bg-income/5 p-2.5 text-xs">
              This also reduces <span className="font-semibold">{rule.loan.name}</span>'s outstanding balance
              by the amount posted.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="post-amount">Amount</Label>
              <Input
                id="post-amount"
                type="number"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="post-date">Date</Label>
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
            Cancel
          </Button>
          <Button onClick={submit} disabled={post.isPending}>
            Post transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
