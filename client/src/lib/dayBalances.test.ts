import { describe, it, expect } from "vitest";
import { dayEndBalances, type DayGroup, type LedgerSnapshot } from "./dayBalances";
import type { Transaction } from "./types";

/**
 * dayEndBalances answers "where did each account stand at the end of this day?"
 * by anchoring on the balances as of the window's end and walking the newest-first
 * day groups backwards. These specs pin the invariants that make the answer
 * trustworthy — above all that a transfer moves BOTH of its accounts, which is
 * what makes credits (modelled as transfers to/from "Money Lent") visible.
 */

const HDFC = "acct-hdfc";
const ICICI = "acct-icici";
const LENT = "acct-money-lent";

const NAMES: Record<string, string> = {
  [HDFC]: "HDFC",
  [ICICI]: "ICICI",
  [LENT]: "Money Lent",
};

let seq = 0;
function txn(partial: {
  type: Transaction["type"];
  amount: number;
  account: string;
  toAccount?: string;
}): Transaction {
  const { type, amount, account, toAccount } = partial;
  return {
    _id: `txn-${++seq}`,
    type,
    amount,
    account: { _id: account, name: NAMES[account] ?? account, color: "#123456" },
    toAccount: toAccount ? { _id: toAccount, name: NAMES[toAccount] ?? toAccount } : null,
    date: "2026-07-30T10:00:00.000Z",
    note: "",
    payee: "",
    tags: [],
    currency: "INR",
  };
}

/** Day groups newest-first, the order the list renders them in. */
function days(...entries: [string, Transaction[]][]): DayGroup[] {
  return entries.map(([key, items]) => ({ key, items }));
}

function snapshot(byAccount: Record<string, number>): LedgerSnapshot {
  const total = Object.values(byAccount).reduce((s, n) => s + n, 0);
  return { byAccount, total };
}

const FULL = { includeTotal: true } as const;

describe("dayEndBalances", () => {
  it("reports the touched account's own closing balance, not a blended total", () => {
    // Spent 5k from HDFC today. Anchor: HDFC 42,500 and ICICI 8,120 right now.
    const result = dayEndBalances(
      days(["2026-07-30", [txn({ type: "expense", amount: 5000, account: HDFC })]]),
      snapshot({ [HDFC]: 42_500, [ICICI]: 8_120 }),
      FULL
    );

    const day = result.get("2026-07-30")!;
    expect(day.accounts).toEqual([
      { accountId: HDFC, name: "HDFC", color: "#123456", delta: -5000, balance: 42_500 },
    ]);
    // ICICI wasn't touched, so it gets no line — but it still counts in the total.
    expect(day.total).toBe(50_620);
  });

  it("lists BOTH accounts when a day spends from two of them", () => {
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [
          txn({ type: "expense", amount: 5000, account: HDFC }),
          txn({ type: "expense", amount: 880, account: ICICI }),
        ],
      ]),
      snapshot({ [HDFC]: 42_500, [ICICI]: 8_120 }),
      FULL
    );

    const day = result.get("2026-07-30")!;
    expect(day.accounts.map((a) => [a.accountId, a.balance, a.delta])).toEqual([
      [HDFC, 42_500, -5000],
      [ICICI, 8_120, -880],
    ]);
  });

  it("shows a credit GIVEN on both legs — bank down, receivable up", () => {
    // Lending is a transfer HDFC → Money Lent. The old income−expense walk-back
    // never moved for these, which is the bug this pins shut.
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [txn({ type: "transfer", amount: 20_000, account: HDFC, toAccount: LENT })],
      ]),
      snapshot({ [HDFC]: 42_500, [LENT]: 20_000 }),
      FULL
    );

    const day = result.get("2026-07-30")!;
    expect(day.accounts.map((a) => [a.name, a.delta, a.balance])).toEqual([
      ["HDFC", -20_000, 42_500],
      ["Money Lent", 20_000, 20_000],
    ]);
  });

  it("shows a credit SETTLED on both legs — receivable down, bank up", () => {
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [txn({ type: "transfer", amount: 20_000, account: LENT, toAccount: HDFC })],
      ]),
      snapshot({ [HDFC]: 62_500, [LENT]: 0 }),
      FULL
    );

    expect(result.get("2026-07-30")!.accounts.map((a) => [a.name, a.delta, a.balance])).toEqual([
      ["Money Lent", -20_000, 0],
      ["HDFC", 20_000, 62_500],
    ]);
  });

  it("keeps the portfolio total flat across a transfer, while both legs still move", () => {
    const result = dayEndBalances(
      days(
        ["2026-07-30", [txn({ type: "transfer", amount: 20_000, account: HDFC, toAccount: LENT })]],
        ["2026-07-29", [txn({ type: "expense", amount: 1000, account: HDFC })]]
      ),
      snapshot({ [HDFC]: 42_500, [LENT]: 20_000 }),
      FULL
    );

    // Lending doesn't change what you own, so the total is identical either side…
    expect(result.get("2026-07-30")!.total).toBe(62_500);
    expect(result.get("2026-07-29")!.total).toBe(62_500);
    // …but HDFC's own closing balance differs by the 20k that left it.
    expect(result.get("2026-07-29")!.accounts).toEqual([
      { accountId: HDFC, name: "HDFC", color: "#123456", delta: -1000, balance: 62_500 },
    ]);
  });

  it("walks multiple days back per account, each day closing where the next opens", () => {
    const result = dayEndBalances(
      days(
        ["2026-07-30", [txn({ type: "expense", amount: 5000, account: HDFC })]],
        ["2026-07-29", [txn({ type: "income", amount: 30_000, account: HDFC })]],
        ["2026-07-28", [txn({ type: "expense", amount: 2000, account: ICICI })]]
      ),
      snapshot({ [HDFC]: 42_500, [ICICI]: 8_120 }),
      FULL
    );

    const hdfcOn = (key: string) =>
      result.get(key)!.accounts.find((a) => a.accountId === HDFC)?.balance;
    expect(hdfcOn("2026-07-30")).toBe(42_500);
    expect(hdfcOn("2026-07-29")).toBe(47_500); // before the 5k spend
    // 28th didn't touch HDFC, so no HDFC line — ICICI's is the one that shows.
    expect(hdfcOn("2026-07-28")).toBeUndefined();
    expect(result.get("2026-07-28")!.accounts).toEqual([
      { accountId: ICICI, name: "ICICI", color: "#123456", delta: -2000, balance: 8_120 },
    ]);
    // Totals step by income − expense: 45,620 → 50,620 → 20,620.
    expect(result.get("2026-07-30")!.total).toBe(50_620);
    expect(result.get("2026-07-29")!.total).toBe(55_620);
    expect(result.get("2026-07-28")!.total).toBe(25_620);
  });

  it("nets several movements on one account into a single line", () => {
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [
          txn({ type: "expense", amount: 5000, account: HDFC }),
          txn({ type: "income", amount: 1200, account: HDFC }),
          txn({ type: "expense", amount: 300, account: HDFC }),
        ],
      ]),
      snapshot({ [HDFC]: 42_500 }),
      FULL
    );

    const day = result.get("2026-07-30")!;
    expect(day.accounts).toHaveLength(1);
    expect(day.accounts[0].delta).toBe(-4100);
  });

  it("orders lines by first appearance in the day's rows", () => {
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [
          txn({ type: "expense", amount: 100, account: ICICI }),
          txn({ type: "expense", amount: 100, account: HDFC }),
          txn({ type: "expense", amount: 100, account: ICICI }),
        ],
      ]),
      snapshot({ [HDFC]: 1000, [ICICI]: 2000 }),
      FULL
    );

    expect(result.get("2026-07-30")!.accounts.map((a) => a.accountId)).toEqual([ICICI, HDFC]);
  });

  it("still lists an account whose day nets to zero — it was touched", () => {
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [
          txn({ type: "expense", amount: 500, account: HDFC }),
          txn({ type: "income", amount: 500, account: HDFC }),
        ],
      ]),
      snapshot({ [HDFC]: 1000 }),
      FULL
    );

    expect(result.get("2026-07-30")!.accounts).toEqual([
      { accountId: HDFC, name: "HDFC", color: "#123456", delta: 0, balance: 1000 },
    ]);
  });

  describe("under an account filter", () => {
    it("keeps only the selected accounts' lines and drops the total", () => {
      const result = dayEndBalances(
        days([
          "2026-07-30",
          [txn({ type: "transfer", amount: 20_000, account: HDFC, toAccount: LENT })],
        ]),
        snapshot({ [HDFC]: 42_500, [LENT]: 20_000 }),
        { restrictTo: [HDFC], includeTotal: false }
      );

      const day = result.get("2026-07-30")!;
      expect(day.accounts.map((a) => a.accountId)).toEqual([HDFC]);
      // Money Lent has movements outside the filter, so its walk-back isn't safe
      // to show — and the portfolio total can't be stepped at all.
      expect(day.total).toBeNull();
    });

    it("still steps the selected account back correctly across days", () => {
      const result = dayEndBalances(
        days(
          ["2026-07-30", [txn({ type: "expense", amount: 5000, account: HDFC })]],
          ["2026-07-29", [txn({ type: "transfer", amount: 20_000, account: HDFC, toAccount: LENT })]]
        ),
        snapshot({ [HDFC]: 42_500, [LENT]: 20_000 }),
        { restrictTo: [HDFC], includeTotal: false }
      );

      expect(result.get("2026-07-30")!.accounts[0].balance).toBe(42_500);
      expect(result.get("2026-07-29")!.accounts[0].balance).toBe(47_500);
    });
  });

  it("omits the total row when it can't be reconciled", () => {
    const result = dayEndBalances(
      days(["2026-07-30", [txn({ type: "expense", amount: 100, account: HDFC })]]),
      snapshot({ [HDFC]: 1000 }),
      { includeTotal: false }
    );
    expect(result.get("2026-07-30")!.total).toBeNull();
  });

  it("reads ids from unpopulated string refs, falling back to an empty name", () => {
    const bare: Transaction = { ...txn({ type: "expense", amount: 100, account: HDFC }), account: HDFC };
    const result = dayEndBalances(
      days(["2026-07-30", [bare]]),
      snapshot({ [HDFC]: 1000 }),
      FULL
    );
    expect(result.get("2026-07-30")!.accounts).toEqual([
      { accountId: HDFC, name: "", color: undefined, delta: -100, balance: 1000 },
    ]);
  });

  it("omits an account it has no anchor for rather than implying a zero balance", () => {
    const result = dayEndBalances(
      days(["2026-07-30", [txn({ type: "expense", amount: 100, account: "ghost-account" })]]),
      snapshot({ [HDFC]: 1000 }),
      FULL
    );
    expect(result.get("2026-07-30")!.accounts).toEqual([]);
  });

  it("leaves an unanchored account's movements out of the per-account walk-back", () => {
    // A later day must not inherit a bogus step from an account we can't anchor.
    const result = dayEndBalances(
      days(
        ["2026-07-30", [txn({ type: "expense", amount: 100, account: "ghost-account" })]],
        ["2026-07-29", [txn({ type: "expense", amount: 400, account: HDFC })]]
      ),
      snapshot({ [HDFC]: 1000 }),
      FULL
    );
    expect(result.get("2026-07-29")!.accounts[0].balance).toBe(1000);
  });

  it("handles a self-transfer as a single touched account with no net change", () => {
    const result = dayEndBalances(
      days([
        "2026-07-30",
        [txn({ type: "transfer", amount: 500, account: HDFC, toAccount: HDFC })],
      ]),
      snapshot({ [HDFC]: 1000 }),
      FULL
    );
    expect(result.get("2026-07-30")!.accounts).toEqual([
      { accountId: HDFC, name: "HDFC", color: "#123456", delta: 0, balance: 1000 },
    ]);
  });

  it("returns an entry for every group, including days with no rows", () => {
    const result = dayEndBalances(days(["2026-07-30", []]), snapshot({ [HDFC]: 1000 }), FULL);
    expect(result.get("2026-07-30")).toEqual({ accounts: [], total: 1000 });
  });

  it("does not mutate the caller's snapshot", () => {
    const snap = snapshot({ [HDFC]: 42_500 });
    dayEndBalances(
      days(["2026-07-30", [txn({ type: "expense", amount: 5000, account: HDFC })]]),
      snap,
      FULL
    );
    expect(snap.byAccount[HDFC]).toBe(42_500);
    expect(snap.total).toBe(42_500);
  });

  it("treats an empty restrictTo as no restriction", () => {
    const result = dayEndBalances(
      days(["2026-07-30", [txn({ type: "expense", amount: 100, account: HDFC })]]),
      snapshot({ [HDFC]: 1000 }),
      { restrictTo: [], includeTotal: true }
    );
    expect(result.get("2026-07-30")!.accounts).toHaveLength(1);
  });
});
