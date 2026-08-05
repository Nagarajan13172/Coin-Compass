import type { Split, SplitParticipant, Transaction } from "@/lib/types";

/**
 * Half a paisa — the tolerance for "these shares add up". Mirrors the server's
 * SPLIT_EPSILON (server/src/services/splitService.ts) and SETTLED_EPSILON in
 * ./credits: summing decimal amounts leaves float dust like 1e-10.
 */
export const SPLIT_EPSILON = 0.005;

/**
 * Divide a bill into `n` equal shares that sum EXACTLY back to the total.
 *
 * Deliberately identical to the server's splitEqually — the editor previews the
 * shares before they're posted, and a client that rounded differently would show
 * numbers the server then rejects. Works in integer paise for that reason.
 *
 *   splitEqually(3000, 6) -> [500, 500, 500, 500, 500, 500]
 *   splitEqually(1000, 3) -> [333.34, 333.33, 333.33]
 */
export function splitEqually(total: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1 || !(total >= 0)) return [];
  const totalPaise = Math.round(total * 100);
  const base = Math.floor(totalPaise / n);
  const remainder = totalPaise - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

/**
 * The shares an auto-equal rebalance should write, or `null` when it must not
 * write at all.
 *
 * The null case is load-bearing. The editor rebalances from an effect, and child
 * effects run BEFORE their parent's — so on mount it sees the empty initial list
 * a moment before the parent seeds the first row. Returning shares there would
 * write `[]` back over that seed and open the form with nobody to split with.
 * Kept out of the component so the rule is testable on its own.
 */
export function rebalancedShares(
  total: number,
  participantCount: number
): { yourShare: number; shares: number[] } | null {
  if (!Number.isInteger(participantCount) || participantCount < 1) return null;
  const shares = splitEqually(total, participantCount + 1);
  if (shares.length !== participantCount + 1) return null;
  return { yourShare: shares[0], shares: shares.slice(1) };
}

/**
 * What's left to hand out before the split balances. Positive = still
 * unallocated, negative = over-allocated. The editor shows this live so the user
 * can see the gap close rather than discovering it in a validation error.
 */
export function remainingToAllocate(total: number, yourShare: number, shares: number[]): number {
  const assigned = shares.reduce((a, b) => a + b, yourShare || 0);
  const diff = (total || 0) - assigned;
  // Snap float dust to zero so "0.00 left" never renders as -1e-13.
  return Math.abs(diff) < SPLIT_EPSILON ? 0 : diff;
}

/** Whether the shares add up, i.e. whether the split can be saved. */
export function isBalanced(total: number, yourShare: number, shares: number[]): boolean {
  return (total || 0) > 0 && remainingToAllocate(total, yourShare, shares) === 0;
}

/**
 * The split a transaction belongs to, if any. Your own share carries `split`
 * directly; a participant's transfer leg reaches the bill through its credit.
 * Mirrors splitIdForTransaction on the server.
 */
export function splitIdOf(txn: Transaction): string | null {
  if (txn.split) return typeof txn.split === "string" ? txn.split : txn.split._id;
  const credit = txn.credit;
  if (credit && typeof credit !== "string" && credit.split) return credit.split;
  return null;
}

/**
 * Collapse a transaction list so every leg of a shared bill becomes ONE entry.
 *
 * A six-way split posts six transactions (your expense + five transfers); shown
 * raw, one dinner buries the rest of the day's activity. Order is preserved by
 * the position of each split's FIRST leg, so nothing jumps around.
 */
export type LedgerEntry =
  | { kind: "txn"; txn: Transaction }
  | { kind: "split"; splitId: string; legs: Transaction[] };

export function groupBySplit(txns: Transaction[]): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const bySplit = new Map<string, Transaction[]>();

  for (const txn of txns) {
    const splitId = splitIdOf(txn);
    if (!splitId) {
      entries.push({ kind: "txn", txn });
      continue;
    }
    const existing = bySplit.get(splitId);
    if (existing) {
      existing.push(txn);
      continue;
    }
    const legs = [txn];
    bySplit.set(splitId, legs);
    entries.push({ kind: "split", splitId, legs });
  }
  return entries;
}

/** People on a bill who still owe something, most owed first. */
export function unsettledParticipants(split: Split): SplitParticipant[] {
  return split.participants
    .filter((p) => p.outstanding > SPLIT_EPSILON)
    .sort((a, b) => b.outstanding - a.outstanding);
}

/** Total still owed to you across a bill's participants. */
export function splitOutstanding(split: Split): number {
  return unsettledParticipants(split).reduce((sum, p) => sum + Math.min(p.outstanding, p.amount), 0);
}

/** A bill is settled when nobody on it still owes you anything. */
export function isSplitSettled(split: Split): boolean {
  return unsettledParticipants(split).length === 0;
}
