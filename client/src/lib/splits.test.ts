import { describe, it, expect } from "vitest";
import {
  splitEqually,
  rebalancedShares,
  remainingToAllocate,
  isBalanced,
  splitIdOf,
  groupBySplit,
  unsettledParticipants,
  splitOutstanding,
  isParticipantSettled,
  isSplitSettled,
  SPLIT_EPSILON,
} from "./splits";
import type { Split, Transaction } from "@/lib/types";

const txn = (over: Partial<Transaction> = {}): Transaction =>
  ({
    _id: Math.random().toString(36).slice(2),
    type: "expense",
    amount: 100,
    account: "a1",
    date: "2026-08-01T00:00:00.000Z",
    note: "",
    payee: "",
    tags: [],
    currency: "INR",
    ...over,
  }) as Transaction;

/**
 * The editor previews shares before posting them, so its division must match the
 * server's splitEqually exactly — otherwise it shows numbers the server rejects.
 */
describe("splitEqually — mirrors the server's division", () => {
  it("divides the KFC bill evenly (3,000 across 6)", () => {
    expect(splitEqually(3000, 6)).toEqual([500, 500, 500, 500, 500, 500]);
  });

  it("gives the odd paise to the earliest shares", () => {
    expect(splitEqually(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("never loses or invents money", () => {
    for (const total of [3000, 1000, 999.99, 7, 0.03]) {
      for (let n = 1; n <= 10; n++) {
        const sum = splitEqually(total, n).reduce((a, b) => a + b, 0);
        expect(Math.abs(sum - total)).toBeLessThan(SPLIT_EPSILON);
      }
    }
  });

  it("returns nothing for a nonsensical group size, rather than NaNs", () => {
    expect(splitEqually(100, 0)).toEqual([]);
    expect(splitEqually(100, -1)).toEqual([]);
    expect(splitEqually(100, 1.5)).toEqual([]);
  });
});

/**
 * Regression cover for a real bug: the editor opened with NOBODY to split with.
 * Its rebalance runs from an effect, child effects run before the parent's, and
 * on mount it saw the empty initial list a moment before the parent seeded the
 * first row — then wrote that emptiness back over the seed.
 */
describe("rebalancedShares — when an auto-equal rebalance may write", () => {
  it("refuses to produce anything for an empty participant list", () => {
    expect(rebalancedShares(3000, 0)).toBeNull();
  });

  it("refuses nonsensical counts rather than emitting NaN shares", () => {
    expect(rebalancedShares(3000, -1)).toBeNull();
    expect(rebalancedShares(3000, 1.5)).toBeNull();
  });

  it("splits the KFC bill across you plus five others", () => {
    expect(rebalancedShares(3000, 5)).toEqual({
      yourShare: 500,
      shares: [500, 500, 500, 500, 500],
    });
  });

  it("counts YOU as well as the participants (one other person = halves)", () => {
    expect(rebalancedShares(3000, 1)).toEqual({ yourShare: 1500, shares: [1500] });
  });

  it("returns one share per participant, always", () => {
    for (let n = 1; n <= 8; n++) {
      expect(rebalancedShares(1000, n)?.shares).toHaveLength(n);
    }
  });

  it("still adds up to the bill once your share is counted", () => {
    for (const total of [3000, 1000, 999.99, 7]) {
      for (let n = 1; n <= 8; n++) {
        const r = rebalancedShares(total, n)!;
        const sum = r.shares.reduce((a, b) => a + b, r.yourShare);
        expect(Math.abs(sum - total)).toBeLessThan(SPLIT_EPSILON);
      }
    }
  });

  it("handles a bill not yet typed — zero shares, but still one row per person", () => {
    expect(rebalancedShares(0, 2)).toEqual({ yourShare: 0, shares: [0, 0] });
  });
});

describe("remainingToAllocate — the live gap shown in the editor", () => {
  it("is zero when the split balances", () => {
    expect(remainingToAllocate(3000, 500, [500, 500, 500, 500, 500])).toBe(0);
  });

  it("is positive when money is still unallocated", () => {
    expect(remainingToAllocate(3000, 500, [500, 500])).toBe(1500);
  });

  it("is negative when too much has been handed out", () => {
    expect(remainingToAllocate(1000, 500, [700])).toBe(-200);
  });

  it("snaps float dust to exactly zero, so the UI never shows -1e-13 left", () => {
    expect(remainingToAllocate(0.3, 0.1, [0.2])).toBe(0);
    expect(remainingToAllocate(1000, 333.34, [333.33, 333.33])).toBe(0);
  });

  it("treats a blank total or share as zero rather than NaN", () => {
    expect(remainingToAllocate(NaN || 0, NaN || 0, [])).toBe(0);
    expect(remainingToAllocate(500, 0, [])).toBe(500);
  });
});

describe("isBalanced — whether the split can be saved", () => {
  it("accepts a balanced split", () => {
    expect(isBalanced(3000, 500, [500, 500, 500, 500, 500])).toBe(true);
  });

  it("accepts the rounded output of splitEqually", () => {
    const [mine, ...others] = splitEqually(1000, 3);
    expect(isBalanced(1000, mine, others)).toBe(true);
  });

  it("rejects an unbalanced split in either direction", () => {
    expect(isBalanced(3000, 500, [500])).toBe(false);
    expect(isBalanced(1000, 900, [900])).toBe(false);
  });

  it("rejects a zero bill — there is nothing to split", () => {
    expect(isBalanced(0, 0, [])).toBe(false);
  });
});

describe("splitIdOf — finding a leg's bill", () => {
  it("reads your own share's direct link", () => {
    expect(splitIdOf(txn({ split: "s1" }))).toBe("s1");
    expect(splitIdOf(txn({ split: { _id: "s1", description: "KFC", totalAmount: 3000, yourShare: 500 } }))).toBe("s1");
  });

  it("reads a participant's leg through its credit", () => {
    expect(splitIdOf(txn({ credit: { _id: "c1", person: "Ravi", direction: "given", split: "s1" } }))).toBe("s1");
  });

  it("is null for an ordinary transaction and for a credit with no split", () => {
    expect(splitIdOf(txn())).toBeNull();
    expect(splitIdOf(txn({ credit: { _id: "c1", person: "Ravi", direction: "given" } }))).toBeNull();
    expect(splitIdOf(txn({ credit: "c1" }))).toBeNull();
  });
});

describe("groupBySplit — one bill reads as one ledger row", () => {
  it("collapses every leg of a split into a single entry", () => {
    const legs = [
      txn({ split: "s1", type: "expense", amount: 500 }),
      ...["Ravi", "Meera"].map((person) =>
        txn({ credit: { _id: person, person, direction: "given", split: "s1" }, type: "transfer", amount: 500 })
      ),
    ];
    const entries = groupBySplit(legs);
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe("split");
    expect(entries[0].kind === "split" && entries[0].legs).toHaveLength(3);
  });

  it("leaves ordinary transactions alone", () => {
    const entries = groupBySplit([txn(), txn()]);
    expect(entries.map((e) => e.kind)).toEqual(["txn", "txn"]);
  });

  it("keeps order by each split's first leg, so rows don't jump", () => {
    const entries = groupBySplit([
      txn({ _id: "before" }),
      txn({ _id: "legA", split: "s1" }),
      txn({ _id: "other" }),
      txn({ _id: "legB", split: "s1" }), // a later leg folds back into the first entry
      txn({ _id: "after" }),
    ]);
    expect(entries).toHaveLength(4);
    expect(entries[1].kind === "split" && entries[1].legs.map((l) => l._id)).toEqual(["legA", "legB"]);
    expect(entries[2].kind === "txn" && entries[2].txn._id).toBe("other");
  });

  it("keeps two different bills apart", () => {
    const entries = groupBySplit([txn({ split: "s1" }), txn({ split: "s2" }), txn({ split: "s1" })]);
    expect(entries).toHaveLength(2);
    expect(entries[0].kind === "split" && entries[0].legs).toHaveLength(2);
    expect(entries[1].kind === "split" && entries[1].legs).toHaveLength(1);
  });

  it("handles an empty list", () => {
    expect(groupBySplit([])).toEqual([]);
  });
});

const split = (participants: Split["participants"]): Split =>
  ({
    _id: "s1",
    description: "KFC",
    totalAmount: 3000,
    yourShare: 500,
    date: "2026-08-01T00:00:00.000Z",
    method: "",
    note: "",
    participants,
  }) as Split;

describe("settlement state of a bill", () => {
  const owing = split([
    { person: "Ravi", amount: 500, credit: "c1", outstanding: 500 },
    { person: "Meera", amount: 500, credit: "c2", outstanding: 200 },
    { person: "Arjun", amount: 500, credit: "c3", outstanding: 0 },
  ]);

  it("lists only the people who still owe, most owed first", () => {
    expect(unsettledParticipants(owing).map((p) => p.person)).toEqual(["Ravi", "Meera"]);
  });

  it("totals what's still owed on the bill", () => {
    expect(splitOutstanding(owing)).toBe(700);
  });

  it("takes `outstanding` at face value — it is already per-bill", () => {
    // It used to be the person's OVERALL net, which had to be capped at their
    // share. Now the server allocates per share, so no clamping is involved and
    // a value above the share would be a bug worth seeing rather than hiding.
    const s = split([{ person: "Meera", amount: 500, credit: "c1", outstanding: 500 }]);
    expect(splitOutstanding(s)).toBe(500);
  });

  it("honours the server's explicit settled flag over the amount", () => {
    const done = { person: "Ravi", amount: 500, credit: "c1", outstanding: 0, settled: true };
    const open = { person: "Meera", amount: 500, credit: "c2", outstanding: 500, settled: false };
    expect(isParticipantSettled(done as never)).toBe(true);
    expect(isParticipantSettled(open as never)).toBe(false);
    expect(splitOutstanding(split([done, open] as never))).toBe(500);
  });

  it("falls back to the amount when no flag is sent", () => {
    expect(isParticipantSettled({ person: "R", amount: 500, credit: "c", outstanding: 0 } as never)).toBe(true);
    expect(isParticipantSettled({ person: "R", amount: 500, credit: "c", outstanding: 5 } as never)).toBe(false);
  });

  it("is settled once nobody owes anything", () => {
    expect(isSplitSettled(owing)).toBe(false);
    expect(isSplitSettled(split([{ person: "Ravi", amount: 500, credit: "c1", outstanding: 0 }]))).toBe(true);
  });

  it("treats float dust as settled, not as a lingering paisa", () => {
    const s = split([{ person: "Ravi", amount: 500, credit: "c1", outstanding: 1e-10 }]);
    expect(isSplitSettled(s)).toBe(true);
    expect(splitOutstanding(s)).toBe(0);
  });
});
