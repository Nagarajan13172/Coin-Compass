import { useEffect, useState } from "react";
import { format } from "date-fns";
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
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useCreateRecurring, useUpdateRecurring } from "@/hooks/useRecurring";
import type { Frequency, Recurring, TxnType } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recurring?: Recurring | null;
}

export function RecurringFormDialog({ open, onOpenChange, recurring }: Props) {
  const { data: accounts } = useAccounts();
  const create = useCreateRecurring();
  const update = useUpdateRecurring();
  const isEdit = Boolean(recurring);

  const [type, setType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [interval, setInterval] = useState("1");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");

  const { data: categories } = useCategories(type === "transfer" ? undefined : type);

  useEffect(() => {
    if (!open) return;
    setType(recurring?.type ?? "expense");
    setAmount(recurring ? String(recurring.amount) : "");
    setAccount(recurring?.account?._id ?? accounts?.[0]?._id ?? "");
    setToAccount(recurring?.toAccount?._id ?? accounts?.[1]?._id ?? "");
    setCategory(recurring?.category?._id ?? "");
    setFrequency(recurring?.frequency ?? "monthly");
    setInterval(String(recurring?.interval ?? 1));
    setStartDate(format(new Date(recurring?.startDate ?? new Date()), "yyyy-MM-dd"));
    setNote(recurring?.note ?? "");
  }, [open, recurring, accounts]);

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!account) return toast.error("Select an account");
    if (type === "transfer" && account === toAccount)
      return toast.error("Accounts must differ");
    if (type !== "transfer" && !category) return toast.error("Pick a category");

    const payload = {
      type,
      amount: amt,
      account,
      toAccount: type === "transfer" ? toAccount : null,
      category: type === "transfer" ? null : category,
      frequency,
      interval: Number(interval) || 1,
      startDate: new Date(startDate).toISOString(),
      nextRun: new Date(startDate).toISOString(),
      note,
    };
    try {
      if (isEdit && recurring) {
        await update.mutateAsync({ id: recurring._id, ...payload });
        toast.success("Recurring updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Recurring created");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  const types: TxnType[] = ["expense", "income", "transfer"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit recurring" : "New recurring transaction"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1">
            {types.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={cn(
                  "rounded-lg border py-2 text-sm font-medium capitalize transition-colors",
                  type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-amt">Amount</Label>
              <Input id="rec-amt" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-start">Starts</Label>
              <Input id="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{type === "transfer" ? "From account" : "Account"}</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {type === "transfer" ? (
            <div className="space-y-1.5">
              <Label>To account</Label>
              <Select value={toAccount} onValueChange={setToAccount}>
                <SelectTrigger><SelectValue placeholder="Account" /></SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Repeat every</Label>
              <Input type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Day(s)</SelectItem>
                  <SelectItem value="weekly">Week(s)</SelectItem>
                  <SelectItem value="monthly">Month(s)</SelectItem>
                  <SelectItem value="yearly">Year(s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-note">Note</Label>
            <Input id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
