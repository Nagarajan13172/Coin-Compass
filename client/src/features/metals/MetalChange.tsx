import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** Day-over-day change pill: green/▲ when up, red/▼ when down. */
export function MetalChange({
  changePct,
  className,
}: {
  changePct: number;
  className?: string;
}) {
  const up = changePct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 text-xs font-semibold",
        up ? "text-income" : "text-expense",
        className
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {up ? "+" : "−"}
      {Math.abs(changePct).toFixed(2)}%
    </span>
  );
}
