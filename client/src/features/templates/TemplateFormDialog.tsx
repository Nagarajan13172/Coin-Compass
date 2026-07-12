import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
import { CategoryPicker } from "@/features/transactions/CategoryPicker";
import { useAccounts } from "@/hooks/useAccounts";
import { useCreateTemplate, useUpdateTemplate } from "@/hooks/useTemplates";
import { sanitizeAmount } from "@/lib/amountFormat";
import { currencySymbol } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RefLite, Template } from "@/lib/types";

const FIRST = "__first__";

function refId(v: RefLite | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : v._id;
}

export function TemplateFormDialog({
  open,
  onOpenChange,
  template,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
}) {
  const { t } = useTranslation("templates");
  const { data: accounts } = useAccounts();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const isEdit = Boolean(template);

  const [name, setName] = useState("");
  const [type, setType] = useState<"expense" | "income">("expense");
  const [amountStr, setAmountStr] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  // (re)seed the form each time it opens
  useEffect(() => {
    if (!open) return;
    setName(template?.name ?? "");
    setType(template?.type ?? "expense");
    setAmountStr(template?.amount ? String(template.amount) : "");
    setAccountId(refId(template?.account));
    setCategoryId(refId(template?.category) || null);
    setNote(template?.note ?? "");
  }, [open, template]);

  function switchType(next: "expense" | "income") {
    if (next === type) return;
    setType(next);
    setCategoryId(null); // a category belongs to one type — don't carry it across
  }

  const saving = create.isPending || update.isPending;

  async function handleSave() {
    if (!name.trim()) return toast.error(t("form.nameRequired"));
    const payload = {
      name: name.trim(),
      type,
      amount: Number(amountStr) || 0,
      account: accountId || null,
      category: categoryId || null,
      note: note.trim(),
    };
    try {
      if (isEdit && template) {
        await update.mutateAsync({ id: template._id, ...payload });
        toast.success(t("toast.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("toast.created"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("form.editTitle") : t("form.newTitle")}</DialogTitle>
          <DialogDescription>{t("quickAdd.hint")}</DialogDescription>
        </DialogHeader>

        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1 py-1">
          {/* type */}
          <div className="grid grid-cols-2 gap-2">
            {(["expense", "income"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => switchType(tab)}
                className={cn(
                  "rounded-lg border py-2 text-sm font-semibold transition-colors",
                  type === tab
                    ? tab === "expense"
                      ? "border-transparent bg-expense text-expense-foreground"
                      : "border-transparent bg-income text-income-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {t(`txnType.${tab}`, { ns: "common" })}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">{t("form.name")}</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("form.namePlaceholder")}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-amount">{t("form.amount")}</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol()}
                </span>
                <Input
                  id="tpl-amount"
                  value={amountStr}
                  onChange={(e) => setAmountStr(sanitizeAmount(e.target.value))}
                  inputMode="decimal"
                  placeholder="0"
                  className="pl-7 tnum"
                />
              </div>
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("form.amountHint")}</p>

          <div className="space-y-1.5">
            <Label>{t("labels.account", { ns: "common" })}</Label>
            <Select value={accountId || FIRST} onValueChange={(v) => setAccountId(v === FIRST ? "" : v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={FIRST}>{t("form.firstAccount")}</SelectItem>
                {accounts?.map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t("labels.category", { ns: "common" })}</Label>
            <CategoryPicker type={type} value={categoryId} onChange={setCategoryId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tpl-note">{t("labels.note", { ns: "common" })}</Label>
            <Input
              id="tpl-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("labels.optional", { ns: "common" })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? t("states.saving", { ns: "common" }) : t("actions.save", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
