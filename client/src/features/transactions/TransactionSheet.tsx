import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { useAccounts } from "@/hooks/useAccounts";
import {
  useCreateTransaction,
  useDeleteTransaction,
  useUpdateTransaction,
} from "@/hooks/useTransactions";
import type { RefLite, TxnType } from "@/lib/types";
import { AmountKeypad } from "./AmountKeypad";
import { CategoryPicker } from "./CategoryPicker";

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

  const { data: accounts } = useAccounts();
  const createTxn = useCreateTransaction();
  const updateTxn = useUpdateTransaction();
  const deleteTxn = useDeleteTransaction();

  const [type, setType] = useState<TxnType>(defaultType);
  const [amount, setAmount] = useState(0);
  const [accountId, setAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const isEdit = Boolean(editing);

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
    } else {
      setType(defaultType);
      setAmount(0);
      setCategoryId(null);
      setNote("");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setTags([]);
    }
    setTagInput("");
  }, [open, editing, defaultType]);

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
    if (type !== "transfer" && !categoryId) return toast.error("Pick a category");

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
    };

    try {
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

  const saving = createTxn.isPending || updateTxn.isPending;

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

            {/* category */}
            {type !== "transfer" && (
              <div className="space-y-1.5">
                <Label>Category</Label>
                <CategoryPicker
                  type={type}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              </div>
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
