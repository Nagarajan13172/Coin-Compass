import type { Account, AccountType } from "@/lib/types";

/**
 * Accounts a transaction may name. Excludes the two auto-managed investment
 * buckets: Stock Investments must equal the cost basis of open lots (see
 * stockService) and Savings & Deposits must equal the principal held in deposits
 * (see depositService), and a hand-written transfer in or out would break either
 * silently. Money Lent / Money Owed stay selectable — those are genuine balances
 * the user may need to adjust.
 */
export function spendableAccounts<T extends Pick<Account, "type">>(accounts: T[] | undefined): T[] {
  return (accounts ?? []).filter((a) => a.type !== "securities" && a.type !== "deposits");
}

/** Human-readable label for an account's type (shown as a subtitle/badge). */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  card: "Card",
  wallet: "Wallet",
  upi: "UPI",
  savings: "Savings",
  demat: "Demat",
  // Auto-managed buckets the app creates; listed so the map stays exhaustive.
  receivable: "Money Lent",
  payable: "Money Owed",
  securities: "Stock Investments",
  deposits: "Savings & Deposits",
};
