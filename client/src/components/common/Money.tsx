import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { TxnType } from "@/lib/types";

interface MoneyProps {
  amount: number;
  type?: TxnType;
  currency?: string;
  signed?: boolean;
  compact?: boolean;
  className?: string;
}

/** Money value, color-coded by transaction type (income green / expense red). */
export function Money({ amount, type, currency, signed, compact, className }: MoneyProps) {
  const color =
    type === "income"
      ? "text-income"
      : type === "expense"
        ? "text-expense"
        : type === "transfer"
          ? "text-muted-foreground"
          : undefined;

  const sign = type === "expense" ? -1 : 1;
  const value = signed && type ? sign * Math.abs(amount) : amount;

  return (
    <span className={cn("tnum font-semibold", color, className)}>
      {formatMoney(value, { currency, signed: signed && !!type, compact })}
    </span>
  );
}
