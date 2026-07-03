import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, Link2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { RecordMeta } from "@/components/common/RecordMeta";
import { useUIStore } from "@/stores/ui";
import { useAccounts } from "@/hooks/useAccounts";
import { useLoans } from "@/hooks/useLoans";
import { useCreateCredit } from "@/hooks/useCredits";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "@/hooks/useTransactions";
import { CREDIT_METHODS, type CreditMethod, type RefLite, type TxnType } from "@/lib/types";
import { AmountKeypad } from "./AmountKeypad";
import { CategoryPicker } from "./CategoryPicker";

const NO_LOAN = "__none__";

const TYPE_TABS: { value: TxnType; label: string; cls: string }[] = [
  { value: "expense", label: "Expense", cls: "data-[active=true]:bg-expense data-[active=true]:text-expense-foreground" },
  { value: "income", label: "Income", cls: "data-[active=true]:bg-income data-[active=true]:text-income-foreground" },
  { value: "transfer", label: "Transfer", cls: "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground" },
];

function refId(v: RefLite | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v._id;
}

export function TransactionSheet() {
  const open = useUIStore((s) => s.txnSheetOpen);
  const close = useUIStore((s) => s.closeTxnSheet);
  const editing = useUIStore((s) => s.editingTxn);
  const defaultType = useUIStore((s) => s.defaultTxnType);
  const prefill = useUIStore((s) => s.txnPrefill);

  const { data: accounts } = useAccounts();
  const { data: loans } = useLoans();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const deleteTxn = useDeleteTransaction();
  const createCredit = useCreateCredit();

  const [type, setType] = useState<TxnType>(defaultType);
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [loanId, setLoanId] = useState("");
  // "Money to/from a person" — only offered when creating a new expense/income;
  // submitting goes through the Credits API instead so it also shows up there.
  const [personMode, setPersonMode] = useState(false);
  const [person, setPerson] = useState("");
  const [method, setMethod] = useState<CreditMethod>("Cash");

  const isEdit = Boolean(editing);
  // Already linked to a credit (created from — or previously tagged on — the
  // Credits page): show it read-only rather than letting the transaction form
  // fork the link out of sync with that entry.
  const linkedCredit =
    editing?.credit && typeof editing.credit === "object" ? editing.credit : null;

  function addTag(raw: string) {
    const t = raw.trim().replace(/,+$/, "").trim();
    if (t) setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }
  function handleTagKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  // (re)initialise the form whenever the sheet opens
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setType(editing.type);
      setAmount(editing.amount);
      setAccountId(refId(editing.account) ?? "");
      setToAccountId(refId(editing.toAccount) ?? "");
      setCategoryId(refId(editing.category));
      setDate(format(new Date(editing.date), "yyyy-MM-dd"));
      setNote(editing.note ?? "");
      setTags(editing.tags ?? []);
      setLoanId(refId(editing.loan) ?? "");
      setPersonMode(false);
      setPerson("");
      setMethod("Cash");
    } else {
      // New transaction — seed from any context-aware prefill (e.g. active filters),
      // else fall back to the first account (the accounts-load effect covers the
      // case where accounts arrive after the sheet is already open).
      setType(defaultType);
      setAmount(0);
      setAccountId(prefill?.account ?? accounts?.[0]?._id ?? "");
      setCategoryId(prefill?.category ?? null);
      setNote("");
      setDate(prefill?.date ?? format(new Date(), "yyyy-MM-dd"));
      setTags([]);
      setLoanId("");
      setPersonMode(false);
      setPerson("");
      setMethod("Cash");
    }
    setTagInput("");
  }, [open, editing, defaultType, prefill]);

  // A transfer moves money between your own accounts — it can't represent a
  // credit to another person, so drop out of person mode if the tab changes.
  useEffect(() => {
    if (type === "transfer") setPersonMode(false);
  }, [type]);

  // default the account selection once accounts load
  useEffect(() => {
    if (!accounts?.length) return;
    setAccountId((prev) => prev || accounts[0]._id);
    setToAccountId((prev) => prev || accounts[1]?._id || accounts[0]._id);
  }, [accounts]);

  const activeAccount = useMemo(
    () => accounts?.find((a) => a._id === accountId),
    [accounts, accountId]
  );

  async function handleSubmit() {
    if (amount <= 0) return toast.error("Enter an amount greater than zero");
    if (!accountId) return toast.error("Select an account");
    if (type === "transfer" && accountId === toAccountId)
      return toast.error("Source and destination must differ");
    if (personMode) {
      if (!person.trim()) return toast.error("Enter who this is with");
    } else if (type !== "transfer" && !categoryId) {
      return toast.error("Pick a category");
    }

    try {
      if (personMode && !isEdit) {
        // Goes through the Credits API instead — it creates the same kind of
        // transaction, plus a linked entry that shows up on the Credits page.
        await createCredit.mutateAsync({
          person: person.trim(),
          direction: type === "expense" ? "given" : "received",
          amount,
          date: new Date(date).toISOString(),
          method,
          account: accountId,
          note,
          reflected: true,
        });
        toast.success("Transaction added");
        close();
        return;
      }

      const payload = {
        type,
        amount,
        account: accountId,
        toAccount: type === "transfer" ? toAccountId : null,
        category: type === "transfer" ? null : categoryId,
        date: new Date(date).toISOString(),
        note,
        tags: tagInput.trim() ? [...tags, tagInput.trim()] : tags,
        currency: activeAccount?.currency ?? "INR",
        // Loan repayments only make sense for money leaving an account.
        loan: type !== "income" && loanId ? loanId : null,
      };

      if (isEdit && editing) {
        await updateTxn.mutateAsync({ id: editing._id, ...payload });
        toast.success("Transaction updated");
      } else {
        await createTxn.mutateAsync(payload);
        toast.success("Transaction added");
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete() {
    if (!editing) return;
    try {
      await deleteTxn.mutateAsync(editing._id);
      toast.success("Transaction deleted");
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const saving = createTxn.isPending || updateTxn.isPending || createCredit.isPending;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{isEdit ? "Edit transaction" : "New transaction"}</SheetTitle>
        </SheetHeader>

        {/* type segmented control */}
        <div className="grid grid-cols-3 gap-1 p-4 pb-2">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              data-active={type === t.value}
              onClick={() => setType(t.value)}
              className={cn(
                "rounded-lg border py-2 text-sm font-semibold text-muted-foreground transition-colors",
                "data-[active=true]:border-transparent",
                t.cls,
                type !== t.value && "hover:bg-accent"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4 pt-2">
            <AmountKeypad onChange={setAmount} />

            {/* accounts */}
            {type === "transfer" ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>From</Label>
                  <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
                </div>
                <ArrowRight className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-1.5">
                  <Label>To</Label>
                  <AccountSelect accounts={accounts} value={toAccountId} onChange={setToAccountId} />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Account</Label>
                <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
              </div>
            )}

            {/* already linked to a credit entry — read-only, manage it from the Credits page */}
            {linkedCredit && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  Linked to credit ·{" "}
                  <span className="font-medium">
                    {linkedCredit.direction === "given" ? "You gave" : "You received"} {linkedCredit.person}
                  </span>
                  . Edit the person/note from the Credits page.
                </span>
              </div>
            )}

            {/* money to/from a person — new expense/income only; goes through the Credits API too */}
            {!isEdit && type !== "transfer" && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-4">
                  <p className="text-sm font-medium">Money to/from a person</p>
                  <p className="text-xs text-muted-foreground">Also track this on the Credits page</p>
                </div>
                <Switch checked={personMode} onCheckedChange={setPersonMode} />
              </div>
            )}
            {!isEdit && personMode && type !== "transfer" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="txn-person">Name</Label>
                  <Input
                    id="txn-person"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    placeholder="e.g. Rahul"
                    autoFocus
                  />
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
                    How it moved (GPay, PhonePe, …). The account above is the balance that changes.
                  </p>
                </div>
              </>
            ) : (
              type !== "transfer" &&
              !linkedCredit && (
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} />
                </div>
              )
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="txn-date">Date</Label>
                <Input
                  id="txn-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="txn-note">Note</Label>
                <Input
                  id="txn-note"
                  placeholder="Optional"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="txn-tags">Tags</Label>
              <Input
                id="txn-tags"
                placeholder="Add a tag, press Enter (e.g. Hari, Bed)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                      aria-label={`Remove tag ${t}`}
                    >
                      {t}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Loan repayment — reduces the chosen loan's outstanding balance. */}
            {type !== "income" &&
              !personMode &&
              (() => {
                const options = (loans ?? []).filter((l) => l.status === "active" || l._id === loanId);
                if (options.length === 0) return null;
                return (
                  <div className="space-y-1.5">
                    <Label>Apply to loan (repayment)</Label>
                    <Select
                      value={loanId || NO_LOAN}
                      onValueChange={(v) => setLoanId(v === NO_LOAN ? "" : v)}
                    >
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
                        if (!l) return null;
                        const interest = Math.max(0, Math.round(l.outstanding * (l.roi / 12 / 100)));
                        const principal =
                          amount > 0 ? Math.max(0, Math.min(l.outstanding, amount - interest)) : 0;
                        return (
                          <p className="text-xs text-muted-foreground">
                            {amount > 0 ? (
                              <>
                                ≈ <span className="font-medium text-foreground">{formatMoney(principal)}</span> to
                                principal · {formatMoney(Math.min(interest, amount))} interest — reduces the balance
                                &amp; tenure.
                              </>
                            ) : (
                              "Only the principal portion (payment minus interest) reduces the balance."
                            )}
                          </p>
                        );
                      })()}
                  </div>
                );
              })()}

            {isEdit && editing && (
              <RecordMeta createdAt={editing.createdAt} updatedAt={editing.updatedAt} className="pt-1" />
            )}
          </div>
        </ScrollArea>

        <SheetFooter className="flex-row border-t">
          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleteTxn.isPending}
            >
              Delete
            </Button>
          )}
          <Button
            type="button"
            className="flex-1"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add transaction"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: { _id: string; name: string }[] | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
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
  );
}
