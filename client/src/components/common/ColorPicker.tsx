import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const PALETTE = [
  // Vivid core (Tailwind 500) — spectrum order
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16", "#22C55E",
  "#10B981", "#14B8A6", "#06B6D4", "#0EA5E9", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#D946EF", "#EC4899", "#F43F5E", "#64748B",
  // Lighter tints (Tailwind 400)
  "#F87171", "#FB923C", "#FBBF24", "#FACC15", "#A3E635", "#4ADE80",
  "#34D399", "#2DD4BF", "#22D3EE", "#38BDF8", "#60A5FA", "#818CF8",
  "#A78BFA", "#C084FC", "#E879F9", "#F472B6", "#FB7185", "#94A3B8",
  // Deeper shades (Tailwind 600)
  "#DC2626", "#EA580C", "#D97706", "#CA8A04", "#65A30D", "#16A34A",
  "#059669", "#0D9488", "#0891B2", "#0284C7", "#2563EB", "#4F46E5",
  "#7C3AED", "#9333EA", "#C026D3", "#DB2777", "#E11D48", "#475569",
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
