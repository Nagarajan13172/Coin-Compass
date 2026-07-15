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
import { ColorPicker } from "@/components/common/ColorPicker";
import { IconPicker } from "@/components/common/IconPicker";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { RecordMeta } from "@/components/common/RecordMeta";
import { useCreateCategory, useUpdateCategory } from "@/hooks/useCategories";
import type { Category, CategoryType } from "@/lib/types";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category?: Category | null;
  defaultType: CategoryType;
  /** Called with the freshly created category (e.g. to auto-select it). */
  onCreated?: (category: Category) => void;
}

export function CategoryFormDialog({ open, onOpenChange, category, defaultType, onCreated }: Props) {
  const { t } = useTranslation("recurring");
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const isEdit = Boolean(category);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState("#64748B");
  const [oneoffDefault, setOneoffDefault] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? "tag");
    setColor(category?.color ?? "#64748B");
    setOneoffDefault(category?.oneoffDefault ?? false);
  }, [open, category]);

  async function submit() {
    if (!name.trim()) return toast.error(t("category.errors.name"));
    const payload = { name: name.trim(), icon, color, oneoffDefault, type: category?.type ?? defaultType };
    try {
      if (isEdit && category) {
        await update.mutateAsync({ id: category._id, ...payload });
        toast.success(t("category.toast.updated"));
      } else {
        const created = (await create.mutateAsync(payload)) as Category;
        toast.success(t("category.toast.created"));
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("category.toast.saveFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? t("category.editTitle") : t("category.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={icon} color={color} size="lg" />
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cat-name">{t("labels.name", { ns: "common" })}</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("category.namePlaceholder")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("labels.color", { ns: "common" })}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("labels.icon", { ns: "common" })}</Label>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </div>
          {/* Auto-mark transactions in this category as one-off (e.g. a "Misc" bucket). */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="pr-4">
              <p className="text-sm font-medium">{t("category.oneoffDefault")}</p>
              <p className="text-xs text-muted-foreground">{t("category.oneoffDefaultHelp")}</p>
            </div>
            <Switch
              checked={oneoffDefault}
              onCheckedChange={setOneoffDefault}
              aria-label={t("category.oneoffDefault")}
            />
          </div>
          {isEdit && category && <RecordMeta createdAt={category.createdAt} updatedAt={category.updatedAt} />}
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
