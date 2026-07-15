import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useCategories } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryFormDialog } from "@/features/categories/CategoryFormDialog";
import { cn } from "@/lib/utils";
import { categoryLabel } from "@/lib/i18nLabels";
import type { Category, CategoryType } from "@/lib/types";

interface CategoryPickerProps {
  type: CategoryType;
  value: string | null;
  onChange: (id: string) => void;
}

// Show the most-used categories in their own band only once the full list is
// long enough that scanning it is a chore. Below this, a flat A–Z grid is faster.
const SPLIT_THRESHOLD = 8;
// Cap on the "Frequently used" band — enough to cover daily spends without the
// band churning so much that muscle memory breaks.
const FREQUENT_MAX = 6;

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

  const all = categories ?? [];
  // `all` arrives A–Z (localized) from the hook. Array.sort is stable, so ranking
  // by usage keeps ties in A–Z order — no separate tiebreak needed. Only split out
  // a frequent band for longer lists; short lists stay a single flat grid.
  const frequent =
    all.length > SPLIT_THRESHOLD
      ? all
          .filter((c) => (c.usageCount ?? 0) > 0)
          .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
          .slice(0, FREQUENT_MAX)
      : [];
  const frequentIds = new Set(frequent.map((c) => c._id));
  const rest = all.filter((c) => !frequentIds.has(c._id));

  const tile = (c: Category) => {
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
  };

  return (
    <>
      {frequent.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t("picker.frequent")}
          </p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">{frequent.map(tile)}</div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {rest.map(tile)}

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
