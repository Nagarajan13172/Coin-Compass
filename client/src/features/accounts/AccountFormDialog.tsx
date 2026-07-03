import { useEffect, useState } from "react";
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
import { ColorPicker } from "@/components/common/ColorPicker";
import { IconPicker } from "@/components/common/IconPicker";
import { RecordMeta } from "@/components/common/RecordMeta";
import { useCreateAccount, useUpdateAccount } from "@/hooks/useAccounts";
import { useSettings } from "@/hooks/useSettings";
import type { Account, AccountType } from "@/lib/types";

const TYPES: { value: AccountType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "card", label: "Card" },
  { value: "wallet", label: "Wallet" },
  { value: "upi", label: "UPI" },
  { value: "savings", label: "Savings" },
];

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
    if (!name.trim()) return toast.error("Enter an account name");
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
        toast.success("Account updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Account created");
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
          <DialogTitle>{isEdit ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HDFC Savings" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => onTypeChange(v as AccountType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
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
            <Label htmlFor="acc-bal">{isEdit ? "Initial balance" : "Starting balance"}</Label>
            <Input
              id="acc-bal"
              type="number"
              inputMode="decimal"
              value={initialBalance}
              onChange={(e) => setInitialBalance(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <IconPicker value={icon} color={color} onChange={onIconChange} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Include in total</p>
              <p className="text-xs text-muted-foreground">Count this account in net worth</p>
            </div>
            <Switch checked={includeInTotal} onCheckedChange={setIncludeInTotal} />
          </div>
          {isEdit && account && <RecordMeta createdAt={account.createdAt} updatedAt={account.updatedAt} />}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
