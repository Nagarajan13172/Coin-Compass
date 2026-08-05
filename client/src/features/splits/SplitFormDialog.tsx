import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { AmountInput } from "@/components/common/AmountInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreateSplit } from "@/hooks/useSplits";
import { enumLabel } from "@/lib/i18nLabels";
import { formatMoney } from "@/lib/format";
import { isBalanced } from "@/lib/splits";
import { CREDIT_METHODS, type CreditMethod } from "@/lib/types";
import { CategoryPicker } from "@/features/transactions/CategoryPicker";
import { PersonPicker, type PersonSelection } from "@/features/people/PersonPicker";
import { cn } from "@/lib/utils";
import { SplitEditor, newParticipant, type ParticipantDraft } from "./SplitEditor";

/**
 * Record a bill you paid that several people shared.
 *
 * Deliberately its own form rather than a mode of the transaction sheet: a split
 * doesn't produce a transaction, it produces a Split plus one credit per person
 * (and the ledger legs behind them). Splits happen a handful of times a month
 * against 100+ ordinary entries, so the everyday form shouldn't carry its weight.
 */
export function SplitFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("splits");
  const { data: accounts } = useAccounts();
  const create = useCreateSplit();

  const [description, setDescription] = useState("");
  const [total, setTotal] = useState("");
  const [yourShare, setYourShare] = useState(0);
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState<CreditMethod>("Cash");
  // Who put the money down. When a friend paid, nothing left your accounts —
  // you simply owe them your share, and what the others owe THEM isn't your
  // ledger's business, so the participant editor drops away entirely.
  const [theyPaid, setTheyPaid] = useState(false);
  const [payer, setPayer] = useState<PersonSelection>({ name: "", personId: null });

  // Reset on every open so a previous bill never bleeds into the next one.
  // Keyed on `open` ALONE: this effect clears the participant list, so anything
  // else in its deps (the accounts query, which resolves after the dialog is
  // already on screen) would wipe people the user had just added.
  useEffect(() => {
    if (!open) return;
    setDescription("");
    setTotal("");
    setYourShare(0);
    setParticipants([newParticipant()]);
    setCategoryId(null);
    setDate(format(new Date(), "yyyy-MM-dd"));
    setMethod("Cash");
    setTheyPaid(false);
    setPayer({ name: "", personId: null });
  }, [open]);

  // Default the paying account once accounts load — separate from the reset above
  // precisely so a late-arriving list can't clear the form. Mirrors TransactionSheet.
  useEffect(() => {
    if (!accounts?.length) return;
    setAccountId((prev) => prev || accounts[0]._id);
  }, [accounts]);

  const totalAmount = Number(total) || 0;
  const shares = participants.map((p) => p.amount);
  // When someone else paid, there is nothing to balance — you only know your
  // own share of their bill.
  const balanced = theyPaid
    ? yourShare > 0 && yourShare <= totalAmount
    : isBalanced(totalAmount, yourShare, shares);

  async function submit() {
    if (!description.trim()) return toast.error(t("form.descriptionRequired"));
    if (!(totalAmount > 0)) return toast.error(t("form.totalRequired"));
    if (!categoryId) return toast.error(t("form.categoryRequired"));
    if (theyPaid) {
      if (!payer.name.trim()) return toast.error(t("form.payerRequired"));
      if (!(yourShare > 0)) return toast.error(t("form.yourShareRequired"));
      if (yourShare > totalAmount) return toast.error(t("form.shareOverBill"));
    } else {
      if (!accountId) return toast.error(t("form.accountRequired"));
      if (participants.some((p) => !p.person.trim())) return toast.error(t("form.namesRequired"));
      if (!balanced) return toast.error(t("form.unbalanced"));
    }

    try {
      await create.mutateAsync({
        description: description.trim(),
        totalAmount,
        yourShare,
        date: new Date(date).toISOString(),
        account: theyPaid ? null : accountId,
        category: categoryId,
        method,
        note: "",
        paidBy: theyPaid ? payer.name.trim() : undefined,
        paidById: theyPaid ? payer.personId : undefined,
        participants: theyPaid
          ? []
          : participants.map((p) => ({
              person: p.person.trim(),
              personId: p.personId,
              amount: p.amount,
            })),
      });
      toast.success(t("form.added"), {
        description: theyPaid
          ? t("form.addedOwedDetail", { yours: formatMoney(yourShare), name: payer.name.trim() })
          : t("form.addedDetail", {
              yours: formatMoney(yourShare),
              owed: formatMoney(totalAmount - yourShare),
              count: participants.length,
            }),
      });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("form.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("form.title")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="split-description">{t("form.description")}</Label>
            <Input
              id="split-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("form.descriptionPlaceholder")}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="split-total">{t("form.total")}</Label>
              <AmountInput
                id="split-total"
                value={total}
                onChange={setTotal}
                placeholder="3,000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="split-date">{t("labels.date", { ns: "common" })}</Label>
              <Input id="split-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {/* Who actually paid. This is the fork: if a friend did, nothing left
              your accounts and you owe them your share instead of being owed. */}
          <div className="space-y-1.5">
            <Label>{t("form.whoPaid")}</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
              {([false, true] as const).map((them) => (
                <button
                  key={String(them)}
                  type="button"
                  data-active={theyPaid === them}
                  onClick={() => setTheyPaid(them)}
                  className={cn(
                    "rounded-md py-2 text-sm font-semibold text-muted-foreground transition-colors",
                    "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
                    theyPaid !== them && "hover:bg-accent"
                  )}
                >
                  {them ? t("form.someoneElsePaid") : t("form.iPaid")}
                </button>
              ))}
            </div>
          </div>

          {theyPaid ? (
            <div className="space-y-1.5">
              <Label>{t("form.payer")}</Label>
              <PersonPicker value={payer} onChange={setPayer} placeholder={t("form.payerPlaceholder")} />
              <p className="text-xs text-muted-foreground">{t("form.payerHelp")}</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>{t("form.paidFrom")}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("form.accountPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts?.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("form.paidFromHelp")}</p>
            </div>
          )}

          {/* The heart of this form, so it sits above the category grid — that grid
              is 25 tiles tall and would otherwise push the split below the fold. */}
          {theyPaid ? (
            // No participant editor: you only know your own share of their bill.
            <div className="space-y-1.5 rounded-lg border p-3">
              <Label htmlFor="split-your-share">{t("editor.yourShare")}</Label>
              <AmountInput
                id="split-your-share"
                value={yourShare ? String(yourShare) : ""}
                onChange={(v) => setYourShare(Number(v) || 0)}
                placeholder="500"
              />
              <p className="text-xs text-muted-foreground">{t("form.yourShareOwedHelp")}</p>
            </div>
          ) : (
            <SplitEditor
              total={totalAmount}
              yourShare={yourShare}
              onYourShareChange={setYourShare}
              participants={participants}
              onParticipantsChange={setParticipants}
            />
          )}

          {/* Categorises YOUR share only — the others' shares are a receivable, not spend. */}
          <div className="space-y-1.5">
            <Label>{t("form.category")}</Label>
            <CategoryPicker type="expense" value={categoryId} onChange={(id) => setCategoryId(id)} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("form.method")}</Label>
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
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={create.isPending || !balanced}>
            {create.isPending ? t("states.saving", { ns: "common" }) : t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
