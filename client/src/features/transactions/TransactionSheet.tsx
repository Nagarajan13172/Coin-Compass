import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { enumLabel } from "@/lib/i18nLabels";
import { RecordMeta } from "@/components/common/RecordMeta";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { useUIStore } from "@/stores/ui";
import { useAccounts } from "@/hooks/useAccounts";
import { useLoans } from "@/hooks/useLoans";
import { useCreateCredit } from "@/hooks/useCredits";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useRestoreTransaction,
  useUpdateTransaction,
} from "@/hooks/useTransactions";
import { CREDIT_METHODS, type CreditMethod, type RefLite, type TxnType } from "@/lib/types";
import { AmountKeypad } from "./AmountKeypad";
import { CategoryPicker } from "./CategoryPicker";

const NO_LOAN = "__none__";

const TYPE_TABS: { value: TxnType; cls: string }[] = [
  { value: "expense", cls: "data-[active=true]:bg-expense data-[active=true]:text-expense-foreground" },
  { value: "income", cls: "data-[active=true]:bg-income data-[active=true]:text-income-foreground" },
  { value: "transfer", cls: "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground" },
];

function refId(v: RefLite | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v._id;
}

export function TransactionSheet() {
  const { t } = useTranslation("transactions");
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
  const restoreTxn = useRestoreTransaction();
  const createCredit = useCreateCredit();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
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
      // New transaction — seed from any context-aware prefill (active filters, a
      // calendar day, or a quick-add template), else fall back to the first account
      // (the accounts-load effect covers accounts arriving after the sheet opens).
      setType(defaultType);
      setAmount(prefill?.amount ?? 0);
      setAccountId(prefill?.account ?? accounts?.[0]?._id ?? "");
      setCategoryId(prefill?.category ?? null);
      setNote(prefill?.note ?? "");
      setDate(prefill?.date ?? format(new Date(), "yyyy-MM-dd"));
      setTags(prefill?.tags ?? []);
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
    if (amount <= 0) return toast.error(t("toast.amountRequired"));
    if (!accountId) return toast.error(t("toast.accountRequired"));
    if (type === "transfer" && accountId === toAccountId)
      return toast.error(t("toast.accountsDiffer"));
    if (personMode) {
      if (!person.trim()) return toast.error(t("toast.personRequired"));
    } else if (type !== "transfer" && !categoryId) {
      return toast.error(t("toast.categoryRequired"));
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
        toast.success(t("toast.added"));
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
        toast.success(t("toast.updated"));
      } else {
        await createTxn.mutateAsync(payload);
        toast.success(t("toast.added"));
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
    }
  }

  async function handleDelete() {
    if (!editing) return;
    const id = editing._id;
    try {
      const res = await deleteTxn.mutateAsync(id);
      if (res?.recoverable) {
        // Soft-deleted → offer a one-tap undo (also restorable later from the
        // "Recently deleted" trash on the Transactions page).
        toast.success(t("toast.deleted"), {
          action: {
            label: t("actions.undo", { ns: "common" }),
            onClick: () =>
              restoreTxn.mutate(id, {
                onSuccess: () => toast.success(t("toast.restored")),
                onError: (e) =>
                  toast.error(e instanceof Error ? e.message : t("toast.restoreFailed")),
              }),
          },
        });
      } else {
        toast.success(t("toast.deleted"));
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.deleteFailed"));
      throw e; // keep the confirm dialog open so the user can retry
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
          <SheetTitle>{isEdit ? t("sheet.editTitle") : t("sheet.newTitle")}</SheetTitle>
        </SheetHeader>

        {/* type segmented control */}
        <div className="grid grid-cols-3 gap-1 p-4 pb-2">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              data-active={type === tab.value}
              onClick={() => setType(tab.value)}
              className={cn(
                "rounded-lg border py-2 text-sm font-semibold text-muted-foreground transition-colors",
                "data-[active=true]:border-transparent",
                tab.cls,
                type !== tab.value && "hover:bg-accent"
              )}
            >
              {t(`txnType.${tab.value}`, { ns: "common" })}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4 pt-2">
            <AmountKeypad
              key={editing?._id ?? "new"}
              onChange={setAmount}
              initialAmount={editing?.amount ?? prefill?.amount ?? 0}
            />

            {/* accounts */}
            {type === "transfer" ? (
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>{t("labels.from", { ns: "common" })}</Label>
                  <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
                </div>
                <ArrowRight className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 space-y-1.5">
                  <Label>{t("labels.to", { ns: "common" })}</Label>
                  <AccountSelect accounts={accounts} value={toAccountId} onChange={setToAccountId} />
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>{t("labels.account", { ns: "common" })}</Label>
                <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
              </div>
            )}

            {/* already linked to a credit entry — read-only, manage it from the Credits page */}
            {linkedCredit && (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2 text-sm">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>
                  {t("sheet.linkedPrefix")}{" "}
                  <span className="font-medium">
                    {linkedCredit.direction === "given" ? t("sheet.linkedGave") : t("sheet.linkedReceived")}{" "}
                    {linkedCredit.person}
                  </span>
                  {t("sheet.linkedSuffix")}
                </span>
              </div>
            )}

            {/* money to/from a person — new expense/income only; goes through the Credits API too */}
            {!isEdit && type !== "transfer" && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="pr-4">
                  <p className="text-sm font-medium">{t("sheet.personTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("sheet.personSubtitle")}</p>
                </div>
                <Switch checked={personMode} onCheckedChange={setPersonMode} />
              </div>
            )}
            {!isEdit && personMode && type !== "transfer" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="txn-person">{t("labels.name", { ns: "common" })}</Label>
                  <Input
                    id="txn-person"
                    value={person}
                    onChange={(e) => setPerson(e.target.value)}
                    placeholder={t("sheet.personNamePlaceholder")}
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("sheet.paymentMethod")}</Label>
                  <Select value={method} onValueChange={(v) => setMethod(v as CreditMethod)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CREDIT_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {enumLabel("method", m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {t("sheet.methodHelp")}
                  </p>
                </div>
              </>
            ) : (
              type !== "transfer" &&
              !linkedCredit && (
                <div className="space-y-1.5">
                  <Label>{t("labels.category", { ns: "common" })}</Label>
                  <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} />
                </div>
              )
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="txn-date">{t("labels.date", { ns: "common" })}</Label>
                <Input
                  id="txn-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="txn-note">{t("labels.note", { ns: "common" })}</Label>
                <Input
                  id="txn-note"
                  placeholder={t("labels.optional", { ns: "common" })}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="txn-tags">{t("sheet.tags")}</Label>
              <Input
                id="txn-tags"
                placeholder={t("sheet.tagsPlaceholder")}
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKey}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                      className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/70"
                      aria-label={t("sheet.removeTag", { tag })}
                    >
                      {tag}
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
                    <Label>{t("sheet.applyToLoan")}</Label>
                    <Select
                      value={loanId || NO_LOAN}
                      onValueChange={(v) => setLoanId(v === NO_LOAN ? "" : v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_LOAN}>{t("labels.none", { ns: "common" })}</SelectItem>
                        {options.map((l) => (
                          <SelectItem key={l._id} value={l._id}>
                            {l.name} · {t("sheet.loanLeft", { amount: formatMoney(l.outstanding) })}
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
                                ≈ <span className="font-medium text-foreground">{formatMoney(principal)}</span>{" "}
                                {t("sheet.loanBreakdown", { interest: formatMoney(Math.min(interest, amount)) })}
                              </>
                            ) : (
                              t("sheet.loanPrincipalOnly")
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

        <SheetFooter className="flex-row items-center gap-2 border-t">
          {/* Delete sits on the far left, clearly separated from the Cancel/Save pair
              so it's never mistaken for a cancel action. */}
          {isEdit && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto text-destructive hover:text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteTxn.isPending || saving}
            >
              {t("actions.delete", { ns: "common" })}
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            className={cn(!isEdit && "ml-auto")}
            onClick={close}
            disabled={saving}
          >
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving
              ? t("states.saving", { ns: "common" })
              : isEdit
                ? t("actions.saveChanges", { ns: "common" })
                : t("actions.addTransaction", { ns: "common" })}
          </Button>
        </SheetFooter>
        {editing && (
          <ConfirmDeleteDialog
            open={confirmDeleteOpen}
            onOpenChange={setConfirmDeleteOpen}
            itemKey="transaction"
            confirmValue={String(editing.amount)}
            onConfirm={handleDelete}
          />
        )}
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
  const { t } = useTranslation("transactions");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder={t("sheet.selectAccount")} />
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
