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
import { AmountInput } from "@/components/common/AmountInput";
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
import { categoryLabel } from "@/lib/i18nLabels";
import { dateFnsLocale } from "@/lib/dates";
import type { Frequency, Recurring, TxnType } from "@/lib/types";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation("recurring");
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
    if (!amt || amt <= 0) return toast.error(t("form.errors.amount"));
    if (!account) return toast.error(t("form.errors.account"));
    if (type === "transfer" && account === toAccount)
      return toast.error(t("form.errors.accountsDiffer"));
    if (type !== "transfer" && !category) return toast.error(t("form.errors.category"));
    if (endDate && new Date(endDate) < new Date(startDate))
      return toast.error(t("form.errors.endAfterStart"));

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
        toast.success(t("form.toast.updated"));
      } else {
        await create.mutateAsync({ ...payload, nextRun: new Date(startDate).toISOString() });
        toast.success(t("form.toast.created"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("form.toast.saveFailed"));
    }
  }

  const types: TxnType[] = ["expense", "income", "transfer"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.editTitle") : t("form.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1">
            {types.map((ty) => (
              <button
                key={ty}
                type="button"
                onClick={() => setType(ty)}
                className={cn(
                  "rounded-lg border py-2 text-sm font-medium capitalize transition-colors",
                  type === ty ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                )}
              >
                {t(`txnType.${ty}`, { ns: "common" })}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-amt">{t("labels.amount", { ns: "common" })}</Label>
              <AmountInput id="rec-amt" value={amount} onChange={setAmount} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-start">{t("form.starts")}</Label>
              <Input id="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{type === "transfer" ? t("form.fromAccount") : t("labels.account", { ns: "common" })}</Label>
            <Select value={account} onValueChange={setAccount}>
              <SelectTrigger><SelectValue placeholder={t("labels.account", { ns: "common" })} /></SelectTrigger>
              <SelectContent>
                {accounts?.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {type === "transfer" ? (
            <div className="space-y-1.5">
              <Label>{t("form.toAccount")}</Label>
              <Select value={toAccount} onValueChange={setToAccount}>
                <SelectTrigger><SelectValue placeholder={t("labels.account", { ns: "common" })} /></SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => <SelectItem key={a._id} value={a._id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("labels.category", { ns: "common" })}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder={t("labels.category", { ns: "common" })} /></SelectTrigger>
                <SelectContent>
                  {categories?.map((c) => <SelectItem key={c._id} value={c._id}>{categoryLabel(c.name)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("form.repeatEvery")}</Label>
              <Input type="number" min={1} value={interval} onChange={(e) => setInterval(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.frequency")}</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as Frequency)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{t("form.freqOption.daily")}</SelectItem>
                  <SelectItem value="weekly">{t("form.freqOption.weekly")}</SelectItem>
                  <SelectItem value="monthly">{t("form.freqOption.monthly")}</SelectItem>
                  <SelectItem value="yearly">{t("form.freqOption.yearly")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-end">{t("form.endsOptional")}</Label>
              <Input id="rec-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-payee">{t("form.payee")}</Label>
              <Input id="rec-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder={t("labels.optional", { ns: "common" })} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-note">{t("labels.note", { ns: "common" })}</Label>
            <Input id="rec-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("labels.optional", { ns: "common" })} />
          </div>

          {/* Loan EMI — each posted occurrence reduces the loan's outstanding. */}
          {type !== "income" &&
            (() => {
              const options = (loans ?? []).filter((l) => l.status === "active" || l._id === loanId);
              if (options.length === 0) return null;
              return (
                <div className="space-y-1.5">
                  <Label>{t("form.applyToLoan")}</Label>
                  <Select value={loanId || NO_LOAN} onValueChange={(v) => setLoanId(v === NO_LOAN ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_LOAN}>{t("labels.none", { ns: "common" })}</SelectItem>
                      {options.map((l) => (
                        <SelectItem key={l._id} value={l._id}>
                          {l.name} · {t("form.loanLeft", { amount: formatMoney(l.outstanding) })}
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
                              {t("form.emiPrefix")}{" "}
                              <span className="font-medium text-foreground">{formatMoney(principal)}</span>{" "}
                              {t("form.emiSuffix", { interest: formatMoney(Math.min(interest, amt)) })}
                            </>
                          ) : (
                            t("form.emiHint")
                          )}
                        </p>
                      );
                    })()}
                </div>
              );
            })()}

          {preview.length > 0 && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("form.nextOccurrences")}</p>
              <div className="flex flex-wrap gap-1.5">
                {preview.map((d, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-background px-2 py-1 text-xs tabular-nums shadow-sm"
                  >
                    {format(d, "dd MMM yyyy", { locale: dateFnsLocale() })}
                  </span>
                ))}
              </div>
            </div>
          )}
          {isEdit && recurring && <RecordMeta createdAt={recurring.createdAt} updatedAt={recurring.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("actions.cancel", { ns: "common" })}</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? t("actions.save", { ns: "common" }) : t("actions.create", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
