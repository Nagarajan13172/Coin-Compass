import type { RefLite, Transaction } from "./types";

/** One day's transactions, as grouped by the Transactions list. */
export interface DayGroup {
  key: string;
  items: Transaction[];
}

/** Where one account stood at the end of a day it was touched. */
export interface DayAccountBalance {
  accountId: string;
  /** Display name / colour, lifted from whichever populated ref we saw first. */
  name: string;
  color?: string;
  /** Signed net change to this account on the day. */
  delta: number;
  /** This account's closing balance for the day. */
  balance: number;
}

export interface DayBalance {
  /** Accounts touched that day, in the order they first appear in the day's rows. */
  accounts: DayAccountBalance[];
  /**
   * Grand total across every account at the end of the day, or null when the
   * visible rows can't reconcile to a portfolio total (a filtered view).
   */
  total: number | null;
}

/** Balances as of the window's end — the anchor the walk-back starts from. */
export interface LedgerSnapshot {
  byAccount: Record<string, number>;
  total: number;
}

export interface DayBalanceOptions {
  /**
   * Show lines only for these accounts. Set this under an account filter: the
   * visible rows then cover every movement of the selected accounts (the server
   * matches both transfer legs), so their walk-back is exact — but any OTHER
   * account's is not, because its unrelated transactions were filtered out.
   */
  restrictTo?: readonly string[];
  /**
   * Whether the total row can be trusted. False under any filter: stepping the
   * portfolio total back needs every account's movements, and a filtered list
   * only shows some of them.
   */
  includeTotal: boolean;
}

function refId(v: RefLite | string | null | undefined): string | null {
  if (!v) return null;
  return typeof v === "string" ? v : v._id;
}

function refMeta(v: RefLite | string | null | undefined): { name: string; color?: string } | null {
  return v && typeof v !== "string" ? { name: v.name, color: v.color } : null;
}

/**
 * Per-day, per-account end-of-day balances for a newest-first list of day groups.
 *
 * Anchored on the balances as of the window's end — which already reflect every
 * transaction in it — we emit the running values as the newest day's closing
 * state, then subtract that day's movements to arrive at the previous day's, and
 * repeat. Each day lists only the accounts it actually touched, so spending from
 * two accounts shows two lines, and a credit shows both legs: the bank it left
 * and the "Money Lent" receivable it became.
 *
 * A transfer is applied to BOTH accounts (−amount on the source, +amount on the
 * destination). That's the fix for credits reading as if nothing happened: they
 * are modelled as transfers, so a total that steps only by income − expense
 * never moves when you lend money out or when someone settles up.
 *
 * Pagination is safe: rows arrive newest-first, so every day above the oldest
 * visible one is complete. The oldest visible day may be partially loaded, but
 * its own closing balance is derived from the days ABOVE it, never from its own
 * rows — and nothing older is on screen to inherit the shortfall.
 */
export function dayEndBalances(
  groups: readonly DayGroup[],
  snapshot: LedgerSnapshot,
  opts: DayBalanceOptions
): Map<string, DayBalance> {
  const running: Record<string, number> = { ...snapshot.byAccount };
  let runningTotal = snapshot.total;
  const allow = opts.restrictTo?.length ? new Set(opts.restrictTo) : null;
  const out = new Map<string, DayBalance>();

  for (const group of groups) {
    const order: string[] = [];
    const deltas = new Map<string, number>();
    const meta = new Map<string, { name: string; color?: string }>();

    const touch = (
      ref: RefLite | string | null | undefined,
      amount: number
    ) => {
      const id = refId(ref);
      if (!id) return;
      if (!deltas.has(id)) {
        deltas.set(id, 0);
        order.push(id);
      }
      deltas.set(id, deltas.get(id)! + amount);
      const m = refMeta(ref);
      if (m && !meta.has(id)) meta.set(id, m);
    };

    let dayTotal = 0;
    for (const txn of group.items) {
      if (txn.type === "income") {
        touch(txn.account, txn.amount);
        dayTotal += txn.amount;
      } else if (txn.type === "expense") {
        touch(txn.account, -txn.amount);
        dayTotal -= txn.amount;
      } else {
        // Transfer: leaves one account, lands in the other. Nets to zero on the
        // portfolio total, but moves both accounts — which is exactly what makes
        // a lend or a settlement visible per account.
        touch(txn.account, -txn.amount);
        touch(txn.toAccount, txn.amount);
      }
    }

    // The running values ARE this day's closing state — record before stepping back.
    const accounts: DayAccountBalance[] = [];
    for (const id of order) {
      if (allow && !allow.has(id)) continue;
      // No anchor means no honest balance to show, so omit the line rather than
      // implying zero. Anchors cover every account the user has, so this is
      // defensive only.
      if (!(id in running)) continue;
      accounts.push({
        accountId: id,
        name: meta.get(id)?.name ?? "",
        color: meta.get(id)?.color,
        delta: deltas.get(id)!,
        balance: running[id],
      });
    }
    out.set(group.key, { accounts, total: opts.includeTotal ? runningTotal : null });

    for (const [id, delta] of deltas) {
      if (id in running) running[id] -= delta;
    }
    runningTotal -= dayTotal;
  }

  return out;
}
