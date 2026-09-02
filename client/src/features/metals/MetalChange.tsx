import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Day-over-day change pill: green/▲ when up, red/▼ when down.
 *
 * Pass `change` to show the rupee move beside the percentage — on its own,
 * "−3.13%" doesn't say whether a gram fell by ₹200 or ₹2,000, which is the part
 * that decides whether today is the day to buy.
 */
export function MetalChange({
  changePct,
  change,
  className,
}: {
  changePct: number;
  change?: number;
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
      {change != null && change !== 0 && (
        <span className="font-medium opacity-80">
          ({up ? "+" : "−"}
          {formatMoney(Math.abs(change), { currency: "INR" })})
        </span>
      )}
    </span>
  );
}
