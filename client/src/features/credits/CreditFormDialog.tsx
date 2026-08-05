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
import { AmountInput } from "@/components/common/AmountInput";
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
import { enumLabel } from "@/lib/i18nLabels";
import { RecordMeta } from "@/components/common/RecordMeta";
import { PersonPicker } from "@/features/people/PersonPicker";
import { CategoryPicker } from "@/features/transactions/CategoryPicker";
import { DIRECTION_TONE } from "@/lib/credits";
import {
  CREDIT_DIRECTIONS,
  CREDIT_METHODS,
  type Credit,
  type CreditDirection,
  type CreditMethod,
} from "@/lib/types";

/**
 * Seed values for a NEW entry — adding against an existing person, or settling
 * a balance up (where the person, direction and exact amount are all already
 * known). Ignored when editing, since the credit's own values win.
 */
export interface CreditPrefill {
  person?: string;
  /** The Person behind the prefilled name, so a settle-up lands on their ledger. */
  personId?: string | null;
  direction?: CreditDirection;
  amount?: number;
  /** Account id to reflect into — e.g. the one the original lend went out of. */
  account?: string;
  /** The individual lend being settled, when settling one entry rather than the
   *  person's whole balance. Carried straight through to the API. */
  settles?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  credit?: Credit | null;
  prefill?: CreditPrefill;
}

function refId(v: { _id: string } | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : v._id;
}

/**
 * All four directions, laid out as two rows: what they owe you on top, what you
 * owe them below. Money going OUT of your pocket is styled as an expense, money
 * coming IN as income — which is how the amount will read in the ledger.
 */
/** Colours come from DIRECTION_TONE so the picker and the entry rows agree. */
const DIRECTIONS: { value: CreditDirection; cls: string }[] = CREDIT_DIRECTIONS.map((value) => ({
  value,
  cls: DIRECTION_TONE[value].active,
}));

export function CreditFormDialog({ open, onOpenChange, credit, prefill }: Props) {
  const { t } = useTranslation("credits");
  const { data: accounts } = useAccounts();
  const create = useCreateCredit();
  const update = useUpdateCredit();
  const isEdit = Boolean(credit);

  const [person, setPerson] = useState("");
  // Set when the person was chosen from the list rather than typed; null means
  // "use the name", which the server find-or-creates.
  const [personId, setPersonId] = useState<string | null>(null);
  // Carried from a per-entry settle-up: which lend this repayment pays down.
  // Cleared the moment the direction is flipped away from a repayment.
  const [settles, setSettles] = useState<string | null>(null);
  // On `borrowed`: did they hand you cash, or pay for something you consumed?
  // Only the latter is a real expense, and only it carries a category.
  const [borrowedForThing, setBorrowedForThing] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [direction, setDirection] = useState<CreditDirection>("given");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [method, setMethod] = useState<CreditMethod>("Cash");
  const [accountId, setAccountId] = useState("");
  const [note, setNote] = useState("");
  const [reflected, setReflected] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPerson(credit?.person ?? prefill?.person ?? "");
    setPersonId(credit?.personRef ?? prefill?.personId ?? null);
    setSettles(credit?.settles ?? prefill?.settles ?? null);
    setBorrowedForThing(Boolean(credit?.category));
    setCategoryId(refId(credit?.category) || null);
    setDirection(credit?.direction ?? prefill?.direction ?? "given");
    setAmount(credit ? String(credit.amount) : prefill?.amount ? String(prefill.amount) : "");
    setDate(credit ? credit.date.slice(0, 10) : format(new Date(), "yyyy-MM-dd"));
    setMethod((credit?.method as CreditMethod) || "Cash");
    setAccountId(refId(credit?.account) || prefill?.account || accounts?.[0]?._id || "");
    setNote(credit?.note ?? "");
    setReflected(credit ? credit.reflected : true);
  }, [open, credit, prefill, accounts]);

  async function submit() {
    if (!person.trim()) return toast.error(t("toast.enterPerson"));
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error(t("toast.enterAmount"));
    // "They paid for something you got" is the one reflected case that touches no
    // account of yours — the expense is funded by the debt itself.
    const fundedByDebt = direction === "borrowed" && borrowedForThing;
    if (fundedByDebt && !categoryId) return toast.error(t("toast.selectCategory"));
    if (reflected && !accountId && !fundedByDebt) return toast.error(t("toast.selectAccount"));

    const payload = {
      person: person.trim(),
      personId,
      // Only a repayment can settle a lend; flipping to "given" drops the link.
      settles: direction === "received" ? settles : null,
      direction,
      amount: amt,
      date: new Date(date).toISOString(),
      method,
      category: fundedByDebt ? categoryId : null,
      account: reflected && !fundedByDebt ? accountId : null,
      note: note.trim(),
      reflected,
    };

    try {
      if (isEdit && credit) {
        await update.mutateAsync({ id: credit._id, ...payload });
        toast.success(t("toast.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("toast.added"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.titleEdit") : t("page.addCredit")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="credit-person">{t("labels.name", { ns: "common" })}</Label>
            {/* Picking someone sends their id so the entry joins their existing
                ledger; typing a new name find-or-creates the record server-side. */}
            <PersonPicker
              id="credit-person"
              value={{ name: person, personId }}
              onChange={(v) => {
                setPerson(v.name);
                setPersonId(v.personId);
              }}
              placeholder={t("form.personPlaceholder")}
              autoFocus={!isEdit}
            />
          </div>

          <div className="space-y-1.5">
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
                  {t(`direction.${d.value}`)}
                </button>
              ))}
            </div>
            {/* Four directions is more than most people hold in their head at
                once, so the active one always explains itself. */}
            <p className="text-xs text-muted-foreground">{t(`directionHelp.${direction}`)}</p>
          </div>

          {/* Borrowing splits two ways: cash in hand, or someone paying for
              something you consumed. Only the latter is a real expense, and it
              needs a category — see creditService. */}
          {direction === "borrowed" && (
            <div className="space-y-1.5">
              <Label>{t("borrowKind.label")}</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
                {(["cash", "thing"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    data-active={(k === "thing") === borrowedForThing}
                    onClick={() => setBorrowedForThing(k === "thing")}
                    className={cn(
                      "rounded-md py-2 text-sm font-semibold text-muted-foreground transition-colors",
                      "data-[active=true]:bg-primary data-[active=true]:text-primary-foreground",
                      (k === "thing") !== borrowedForThing && "hover:bg-accent"
                    )}
                  >
                    {t(`borrowKind.${k}`)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {borrowedForThing ? t("borrowKind.thingHelp") : t("borrowKind.cashHelp")}
              </p>
            </div>
          )}

          {direction === "borrowed" && borrowedForThing && (
            <div className="space-y-1.5">
              <Label>{t("labels.category", { ns: "common" })}</Label>
              <CategoryPicker type="expense" value={categoryId} onChange={(id) => setCategoryId(id)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">{t("labels.amount", { ns: "common" })}</Label>
              <AmountInput
                id="credit-amount"
                value={amount}
                onChange={setAmount}
                placeholder="5,000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="credit-date">{t("labels.date", { ns: "common" })}</Label>
              <Input id="credit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
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
            <p className="text-xs text-muted-foreground">
              {t("form.methodHelp")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="credit-note">{t("labels.note", { ns: "common" })}</Label>
            <Input
              id="credit-note"
              placeholder={t("labels.optional", { ns: "common" })}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <p className="text-sm font-medium">{t("form.reflect")}</p>
              <p className="text-xs text-muted-foreground">
                {reflected ? t("form.reflectOn") : t("form.reflectOff")}
              </p>
            </div>
            <Switch checked={reflected} onCheckedChange={setReflected} />
          </div>

          {reflected && (
            <div className="space-y-1.5">
              <Label>{t("form.account")}</Label>
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
              <p className="text-xs text-muted-foreground">
                {t("form.accountHelp")}
              </p>
            </div>
          )}
          {isEdit && credit && <RecordMeta createdAt={credit.createdAt} updatedAt={credit.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? t("actions.save", { ns: "common" }) : t("actions.add", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
