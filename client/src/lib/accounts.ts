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

/**
 * Accounts real money can be paid *from*: everything `spendableAccounts` allows,
 * minus Money Lent and Money Owed.
 *
 * Those two are ledgers of what other people owe, not pots you can draw on, and
 * the server refuses them outright (`ACCOUNT_SYSTEM_MANAGED`). Offering them in
 * a "from account" picker only invites an error — or worse, a rule that quietly
 * points at the wrong place until the day it runs.
 */
export function fundingAccounts<T extends Pick<Account, "type">>(accounts: T[] | undefined): T[] {
  return spendableAccounts(accounts).filter((a) => a.type !== "receivable" && a.type !== "payable");
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
