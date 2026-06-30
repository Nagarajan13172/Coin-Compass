import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const PALETTE = [
  "#2563EB", "#3B82F6", "#0EA5E9", "#06B6D4", "#14B8A6", "#22C55E",
  "#84CC16", "#EAB308", "#F59E0B", "#F97316", "#EF4444", "#EC4899",
  "#D946EF", "#A855F7", "#8B5CF6", "#64748B",
];

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full transition-transform hover:scale-110",
            value === c && "ring-2 ring-offset-2 ring-offset-background"
          )}
          style={{ backgroundColor: c, ...(value === c ? { boxShadow: `0 0 0 2px ${c}` } : {}) }}
          aria-label={`Color ${c}`}
        >
          {value === c && <Check className="h-4 w-4 text-white" />}
        </button>
      ))}
    </div>
  );
}
