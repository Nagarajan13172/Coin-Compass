import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useCategories } from "@/hooks/useCategories";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { CategoryType } from "@/lib/types";

interface CategoryPickerProps {
  type: CategoryType;
  value: string | null;
  onChange: (id: string) => void;
}

export function CategoryPicker({ type, value, onChange }: CategoryPickerProps) {
  const { data: categories, isLoading } = useCategories(type);

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
            <span className="line-clamp-2 text-[11px] font-medium leading-tight">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}
