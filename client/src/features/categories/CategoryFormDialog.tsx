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
import { ColorPicker } from "@/components/common/ColorPicker";
import { IconPicker } from "@/components/common/IconPicker";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useCreateCategory, useUpdateCategory } from "@/hooks/useCategories";
import type { Category, CategoryType } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  category?: Category | null;
  defaultType: CategoryType;
  /** Called with the freshly created category (e.g. to auto-select it). */
  onCreated?: (category: Category) => void;
}

export function CategoryFormDialog({ open, onOpenChange, category, defaultType, onCreated }: Props) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const isEdit = Boolean(category);

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  const [color, setColor] = useState("#64748B");

  useEffect(() => {
    if (!open) return;
    setName(category?.name ?? "");
    setIcon(category?.icon ?? "tag");
    setColor(category?.color ?? "#64748B");
  }, [open, category]);

  async function submit() {
    if (!name.trim()) return toast.error("Enter a name");
    const payload = { name: name.trim(), icon, color, type: category?.type ?? defaultType };
    try {
      if (isEdit && category) {
        await update.mutateAsync({ id: category._id, ...payload });
        toast.success("Category updated");
      } else {
        const created = (await create.mutateAsync(payload)) as Category;
        toast.success("Category created");
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <CategoryIcon icon={icon} color={color} size="lg" />
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coffee" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="space-y-1.5">
            <Label>Icon</Label>
            <IconPicker value={icon} color={color} onChange={setIcon} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
