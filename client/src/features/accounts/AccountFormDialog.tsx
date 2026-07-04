import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { ColorPicker } from "@/components/common/ColorPicker";
import { IconPicker } from "@/components/common/IconPicker";
import { RecordMeta } from "@/components/common/RecordMeta";
import { useCreateAccount, useUpdateAccount } from "@/hooks/useAccounts";
import { useSettings } from "@/hooks/useSettings";
import { enumLabel } from "@/lib/i18nLabels";
import type { Account, AccountType } from "@/lib/types";

const TYPES: AccountType[] = ["cash", "bank", "card", "wallet", "upi", "savings"];

/** A sensible starter icon per account type (used for new accounts until the
 *  user picks their own). e.g. UPI → a phone, since GPay/PhonePe live there. */
const TYPE_ICON: Record<AccountType, string> = {
  cash: "banknote",
  bank: "landmark",
  card: "credit-card",
  wallet: "wallet",
  upi: "smartphone",
  savings: "piggy-bank",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: Account | null;
}

export function AccountFormDialog({ open, onOpenChange, account }: Props) {
  const { t } = useTranslation("accounts");
  const { data: settings } = useSettings();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const isEdit = Boolean(account);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("cash");
  const [initialBalance, setInitialBalance] = useState("0");
  const [currency, setCurrency] = useState("INR");
  const [color, setColor] = useState("#2563EB");
  const [icon, setIcon] = useState("wallet");
  const [includeInTotal, setIncludeInTotal] = useState(true);
  // Track whether the user hand-picked an icon, so switching type only re-seeds
  // a default they haven't touched (new accounts only).
  const [iconTouched, setIconTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setType(account?.type ?? "cash");
    setInitialBalance(String(account?.initialBalance ?? 0));
    setCurrency(account?.currency ?? settings?.baseCurrency ?? "INR");
    setColor(account?.color ?? "#2563EB");
    setIcon(account?.icon ?? "wallet");
    setIncludeInTotal(account?.includeInTotal ?? true);
    setIconTouched(false);
  }, [open, account, settings]);

  // Picking a type re-seeds the icon default (new accounts only, until edited by hand).
  function onTypeChange(v: AccountType) {
    setType(v);
    if (!isEdit && !iconTouched) setIcon(TYPE_ICON[v]);
  }
  function onIconChange(v: string) {
    setIcon(v);
    setIconTouched(true);
  }

  async function submit() {
    if (!name.trim()) return toast.error(t("toast.enterName"));
    const payload = {
      name: name.trim(),
      type,
      initialBalance: Number(initialBalance) || 0,
      currency,
      color,
      icon,
      includeInTotal,
    };
    try {
      if (isEdit && account) {
        await update.mutateAsync({ id: account._id, ...payload });
        toast.success(t("toast.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("toast.created"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failedSave"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editAccount") : t("newAccount")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">{t("labels.name", { ns: "common" })}</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("labels.type", { ns: "common" })}</Label>
              <Select value={type} onValueChange={(v) => onTypeChange(v as AccountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((ty) => (
                    <SelectItem key={ty} value={ty}>
                      {enumLabel("account", ty)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("labels.currency", { ns: "common" })}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {settings?.currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} ({c.symbol})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acc-bal">{isEdit ? t("form.initialBalance") : t("form.startingBalance")}</Label>
            <AmountInput
              id="acc-bal"
              allowNegative
              value={initialBalance}
              onChange={setInitialBalance}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("labels.color", { ns: "common" })}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("labels.icon", { ns: "common" })}</Label>
            <IconPicker value={icon} color={color} onChange={onIconChange} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t("form.includeInTotal")}</p>
              <p className="text-xs text-muted-foreground">{t("form.includeInTotalHelp")}</p>
            </div>
            <Switch checked={includeInTotal} onCheckedChange={setIncludeInTotal} />
          </div>
          {isEdit && account && <RecordMeta createdAt={account.createdAt} updatedAt={account.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? t("actions.save", { ns: "common" }) : t("actions.create", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
