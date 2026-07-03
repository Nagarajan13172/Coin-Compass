import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addYears, format, startOfDay } from "date-fns";
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
import { formatMoney } from "@/lib/format";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useLoans } from "@/hooks/useLoans";
import { useCreateRecurring, useUpdateRecurring } from "@/hooks/useRecurring";
import { RecordMeta } from "@/components/common/RecordMeta";
import type { Frequency, Recurring, TxnType } from "@/lib/types";

const NO_LOAN = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recurring?: Recurring | null;
}

function step(d: Date, frequency: Frequency, n: number): Date {
  if (frequency === "daily") return addDays(d, n);
  if (frequency === "weekly") return addDays(d, 7 * n);
  if (frequency === "monthly") return addMonths(d, n);
  return addYears(d, n);
}

/** Parse a `yyyy-MM-dd` input value as a LOCAL calendar date (not UTC midnight). */
function parseLocalDate(s: string): Date | null {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Client-side mirror of the server schedule, for a live preview of upcoming runs.
 * Looks forward from today so editing an old rule shows future dates, not past ones.
 * All dates are handled in local time so the chips match the date the user sees.
 */
function upcomingRuns(
  startISO: string,
  frequency: Frequency,
  interval: number,
  endISO: string,
  count = 5
): Date[] {
  const out: Date[] = [];
  const start = parseLocalDate(startISO);
  if (!start) return out;
  const end = endISO ? parseLocalDate(endISO) : null;
  const n = Math.max(1, interval);
  const today = startOfDay(new Date());

  let d = start;
  let guard = 0;
  while (d < today && guard < 10000) {
    d = step(d, frequency, n);
    guard += 1;
  }
  for (let i = 0; i < count; i += 1) {
    if (end && d > end) break;
    out.push(new Date(d));
    d = step(d, frequency, n);
  }
  return out;
}

export function RecurringFormDialog({ open, onOpenChange, recurring }: Props) {
  const { data: accounts } = useAccounts();
  const { data: loans } = useLoans();
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
  const [endDate, setEndDate] = useState("");
  const [payee, setPayee] = useState("");
  const [note, setNote] = useState("");
  const [loanId, setLoanId] = useState("");
  // The date strings as first loaded, so an edit only re-sends them when the user
  // actually changed them — this keeps a metadata-only edit from re-anchoring the schedule.
  const [initialStart, setInitialStart] = useState("");
  const [initialEnd, setInitialEnd] = useState("");

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
    const start = format(new Date(recurring?.startDate ?? new Date()), "yyyy-MM-dd");
    const end = recurring?.endDate ? format(new Date(recurring.endDate), "yyyy-MM-dd") : "";
    setStartDate(start);
    setEndDate(end);
    setInitialStart(start);
    setInitialEnd(end);
    setPayee(recurring?.payee ?? "");
    setNote(recurring?.note ?? "");
    setLoanId(recurring?.loan?._id ?? "");
  }, [open, recurring, accounts]);

  const preview = useMemo(
    () => upcomingRuns(startDate, frequency, Number(interval) || 1, endDate),
    [startDate, frequency, interval, endDate]
  );

  async function submit() {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    if (!account) return toast.error("Select an account");
    if (type === "transfer" && account === toAccount)
      return toast.error("Accounts must differ");
    if (type !== "transfer" && !category) return toast.error("Pick a category");
    if (endDate && new Date(endDate) < new Date(startDate))
      return toast.error("End date must be after the start date");

    const payload: Record<string, unknown> = {
      type,
      amount: amt,
      account,
      toAccount: type === "transfer" ? toAccount : null,
      category: type === "transfer" ? null : category,
      frequency,
      interval: Number(interval) || 1,
      payee,
      note,
      loan: type !== "income" && loanId ? loanId : null,
    };
    // Only send the calendar dates when they actually changed. On edit this keeps a
    // metadata-only save from being misread as a start-date change (which would
    // re-anchor the schedule); on create both are always sent.
    if (!isEdit || startDate !== initialStart)
      payload.startDate = new Date(startDate).toISOString();
    if (!isEdit || endDate !== initialEnd)
      payload.endDate = endDate ? new Date(endDate).toISOString() : null;

    try {
      if (isEdit && recurring) {
        // nextRun is deliberately never sent on edit — the server owns the schedule position.
        await update.mutateAsync({ id: recurring._id, ...payload });
        toast.success("Recurring updated");
      } else {
        await create.mutateAsync({ ...payload, nextRun: new Date(startDate).toISOString() });
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-end">Ends (optional)</Label>
              <Input id="rec-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-payee">Payee</Label>
              <Input id="rec-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-note">Note</Label>
            <Input id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </div>

          {/* Loan EMI — each posted occurrence reduces the loan's outstanding. */}
          {type !== "income" &&
            (() => {
              const options = (loans ?? []).filter((l) => l.status === "active" || l._id === loanId);
              if (options.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <Label>Apply to loan (EMI)</Label>
                  <Select value={loanId || NO_LOAN} onValueChange={(v) => setLoanId(v === NO_LOAN ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LOAN}>None</SelectItem>
                      {options.map((l) => (
                        <SelectItem key={l._id} value={l._id}>
                          {l.name} · {formatMoney(l.outstanding)} left
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {loanId &&
                    (() => {
                      const l = options.find((o) => o._id === loanId);
                      const amt = Number(amount) || 0;
                      if (!l) return null;
                      const interest = Math.max(0, Math.round(l.outstanding * (l.roi / 12 / 100)));
                      const principal = amt > 0 ? Math.max(0, Math.min(l.outstanding, amt - interest)) : 0;
                      return (
                        <p className="text-xs text-muted-foreground">
                          {amt > 0 ? (
                            <>
                              Each EMI: ≈{" "}
                              <span className="font-medium text-foreground">{formatMoney(principal)}</span> to
                              principal · {formatMoney(Math.min(interest, amt))} interest.
                            </>
                          ) : (
                            "Each posted EMI reduces the loan's balance by its principal portion."
                          )}
                        </p>
                      );
                    })()}
                </div>
              );
            })()}

          {preview.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Next occurrences</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.map((d, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-background px-2 py-1 text-xs tabular-nums shadow-sm"
                  >
                    {format(d, "dd MMM yyyy")}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isEdit && recurring && <RecordMeta createdAt={recurring.createdAt} updatedAt={recurring.updatedAt} />}
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
