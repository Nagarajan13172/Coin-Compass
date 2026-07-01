import type { AccountType } from "@/lib/types";

/** Human-readable label for an account's type (shown as a subtitle/badge). */
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank",
  card: "Card",
  wallet: "Wallet",
  savings: "Savings",
};

export function accountTypeLabel(type: string): string {
  return ACCOUNT_TYPE_LABEL[type as AccountType] ?? "Account";
}
