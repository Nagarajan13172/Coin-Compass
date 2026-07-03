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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreateCredit, useUpdateCredit } from "@/hooks/useCredits";
import { RecordMeta } from "@/components/common/RecordMeta";
import { CREDIT_METHODS, type Credit, type CreditDirection, type CreditMethod } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  credit?: Credit | null;
  /** Seed a new entry's person name (e.g. reopening for the same person). */
  defaultPerson?: string;
}

function refId(v: { _id: string } | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : v._id;
}

const DIRECTIONS: { value: CreditDirection; label: string; cls: string }[] = [
  { value: "given", label: "You gave", cls: "data-[active=true]:bg-expense data-[active=true]:text-expense-foreground" },
  { value: "received", label: "You received", cls: "data-[active=true]:bg-income data-[active=true]:text-income-foreground" },
];

export function CreditFormDialog({ open, onOpenChange, credit, defaultPerson }: Props) {
  const { data: accounts } = useAccounts();
  const create = useCreateCredit();
  const update = useUpdateCredit();
  const isEdit = Boolean(credit);

  const [person, setPerson] = useState("");
  const [direction, setDirection] = useState<CreditDirection>("given");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState<CreditMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [reflected, setReflected] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPerson(credit?.person ?? defaultPerson ?? "");
    setDirection(credit?.direction ?? "given");
    setAmount(credit ? String(credit.amount) : "");
    setDate(credit ? credit.date.slice(0, 10) : format(new Date(), "yyyy-MM-dd"));
    setMethod((credit?.method as CreditMethod) || "Cash");
    setAccountId(refId(credit?.account) || accounts?.[0]?._id || "");
    setNote(credit?.note ?? "");
    setReflected(credit ? credit.reflected : true);
  }, [open, credit, defaultPerson, accounts]);

  async function submit() {
    if (!person.trim()) return toast.error("Enter who this is with");
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error("Enter an amount greater than 0");
    // The account only matters (and is required) when reflecting into balances.
    if (reflected && !accountId) return toast.error("Select an account to reflect this in your balances");

    const payload = {
      person: person.trim(),
      direction,
      amount: amt,
      date: new Date(date).toISOString(),
      method,
      account: reflected ? accountId : null,
      note: note.trim(),
      reflected,
    };

    try {
      if (isEdit && credit) {
        await update.mutateAsync({ id: credit._id, ...payload });
        toast.success("Credit updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Credit added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit credit" : "Add credit"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="credit-person">Name</Label>
            <Input
              id="credit-person"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder="e.g. Rahul"
              autoFocus={!isEdit}
            />
          </div>

          <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
            {DIRECTIONS.map((d) => (
              <button
                key={d.value}
                type="button"
                data-active={direction === d.value}
                onClick={() => setDirection(d.value)}
                className={cn(
                  "rounded-md py-2 text-sm font-semibold text-muted-foreground transition-colors",
                  d.cls,
                  direction !== d.value && "hover:bg-accent"
                )}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">Amount</Label>
              <Input
                id="credit-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="5000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-date">Date</Label>
              <Input id="credit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as CreditMethod)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREDIT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How the money moved (GPay, PhonePe, …) — just a record, separate from which account changes.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-note">Note</Label>
            <Input id="credit-note" placeholder="Optional" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <p className="text-sm font-medium">Reflect in accounts &amp; transactions</p>
              <p className="text-xs text-muted-foreground">
                {reflected
                  ? `Adds a transaction and updates the selected account's balance.`
                  : `Tracked only here on the Credits page — your accounts and transactions stay untouched.`}
              </p>
            </div>
            <Switch checked={reflected} onCheckedChange={setReflected} />
          </div>

          {reflected && (
            <div className="space-y-1.5">
              <Label>Account to update</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The bank/cash account whose balance moves (e.g. your HDFC account that GPay &amp; PhonePe draw from).
              </p>
            </div>
          )}
          {isEdit && credit && <RecordMeta createdAt={credit.createdAt} updatedAt={credit.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
