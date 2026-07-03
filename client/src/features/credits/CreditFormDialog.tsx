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

const DIRECTIONS: { value: CreditDirection; cls: string }[] = [
  { value: "given", cls: "data-[active=true]:bg-expense data-[active=true]:text-expense-foreground" },
  { value: "received", cls: "data-[active=true]:bg-income data-[active=true]:text-income-foreground" },
];

export function CreditFormDialog({ open, onOpenChange, credit, defaultPerson }: Props) {
  const { t } = useTranslation("credits");
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
    if (!person.trim()) return toast.error(t("toast.enterPerson"));
    const amt = Number(amount);
    if (!(amt > 0)) return toast.error(t("toast.enterAmount"));
    // The account only matters (and is required) when reflecting into balances.
    if (reflected && !accountId) return toast.error(t("toast.selectAccount"));

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
            <Input
              id="credit-person"
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              placeholder={t("form.personPlaceholder")}
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
                {t(`direction.${d.value}`)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="credit-amount">{t("labels.amount", { ns: "common" })}</Label>
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
