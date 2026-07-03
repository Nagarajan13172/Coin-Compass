import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useCategories } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryFormDialog } from "@/features/categories/CategoryFormDialog";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/i18nLabels";
import type { CategoryType } from "@/lib/types";

interface CategoryPickerProps {
  type: CategoryType;
  value: string | null;
  onChange: (id: string) => void;
}

export function CategoryPicker({ type, value, onChange }: CategoryPickerProps) {
  const { t } = useTranslation("transactions");
  const { data: categories, isLoading } = useCategories(type);
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {categories?.map((c) => {
          const active = value === c._id;
          return (
            <button
              key={c._id}
              type="button"
              onClick={() => onChange(c._id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center transition-all",
                active
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-transparent hover:bg-accent"
              )}
            >
              <CategoryIcon icon={c.icon} color={c.color} size="md" />
              <span className="line-clamp-2 text-[11px] font-medium leading-tight">{categoryLabel(c.name)}</span>
            </button>
          );
        })}

        {/* Create a category inline so an in-progress transaction is never lost. */}
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed p-2 text-center text-muted-foreground transition-all hover:border-primary/50 hover:bg-accent hover:text-foreground"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
            <Plus className="h-5 w-5" />
          </span>
          <span className="line-clamp-2 text-[11px] font-medium leading-tight">{t("picker.new")}</span>
        </button>
      </div>

      <CategoryFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        defaultType={type}
        onCreated={(c) => onChange(c._id)}
      />
    </>
  );
}
