import { useUIStore } from "@/stores/ui";
import { categoryLabel } from "@/lib/i18nLabels";
import type { RefLite, TxnType } from "@/lib/types";

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

function refName(v: RefLite | string | null | undefined): string | null {
  return v && typeof v === "object" ? v.name : null;
}

/**
 * A one-line "how much · what · where" summary of a transaction, for toasts and
 * confirmations — e.g. "₹500 · Groceries · HDFC Bank", or "₹500 · HDFC → ICICI"
 * for a transfer, or "₹500 · Rahul · HDFC Bank" for a person credit. Reads the
 * populated account/category/credit refs straight off the transaction, so pass a
 * server-populated record (the create/list response) rather than raw ids.
 */
export function transactionSummary(txn: {
  amount: number;
  currency?: string;
  type: TxnType;
  account?: RefLite | string | null;
  toAccount?: RefLite | string | null;
  category?: RefLite | string | null;
  credit?: { person?: string } | string | null;
}): string {
  const money = formatMoney(txn.amount, { currency: txn.currency });
  const account = refName(txn.account);
  if (txn.type === "transfer") {
    const route = [account, refName(txn.toAccount)].filter(Boolean).join(" → ");
    return [money, route].filter(Boolean).join(" · ");
  }
  // A person credit reads better by whom it's with than by its bookkeeping category.
  const person = txn.credit && typeof txn.credit === "object" ? txn.credit.person : null;
  const label = person || categoryLabel(refName(txn.category));
  return [money, label, account].filter(Boolean).join(" · ");
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
