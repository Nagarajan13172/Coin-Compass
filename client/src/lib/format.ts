import { useUIStore } from "@/stores/ui";

/** Format a number as currency using the active base currency + locale. */
export function formatMoney(
  amount: number,
  opts: { currency?: string; compact?: boolean; signed?: boolean } = {}
): string {
  const { baseCurrency, locale } = useUIStore.getState();
  const currency = opts.currency ?? baseCurrency;
  try {
    const nf = new Intl.NumberFormat(locale || "en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      notation: opts.compact ? "compact" : "standard",
    });
    const formatted = nf.format(Math.abs(amount));
    if (opts.signed && amount !== 0) return `${amount > 0 ? "+" : "−"}${formatted}`;
    return amount < 0 ? `−${formatted}` : formatted;
  } catch {
    return `${amount.toFixed(2)}`;
  }
}

/** Just the currency symbol for the active base currency. */
export function currencySymbol(): string {
  return useUIStore.getState().currencySymbol;
}

/** Compact number for axis labels etc. */
export function compactNumber(n: number): string {
  const { locale } = useUIStore.getState();
  try {
    return new Intl.NumberFormat(locale || "en-IN", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return String(n);
  }
}
