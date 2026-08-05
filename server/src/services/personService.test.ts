import { describe, it, expect } from "vitest";
import { personKey } from "./personService";
import { ledgerKey } from "./creditService";

/**
 * personKey is THE identity rule: two typed names mean the same person exactly
 * when they normalise to the same key. It decides whether a lend and a repayment
 * land on one balance or on two, so its edges matter more than they look.
 */
describe("personKey — when two typed names are one person", () => {
  it("ignores case", () => {
    expect(personKey("Ravi")).toBe(personKey("ravi"));
    expect(personKey("RAVI KUMAR")).toBe(personKey("ravi kumar"));
  });

  it("ignores surrounding whitespace", () => {
    expect(personKey("  Ravi  ")).toBe(personKey("Ravi"));
  });

  it("collapses internal whitespace — the old grouping did not", () => {
    // "Ravi  Kumar" (double space) used to be a separate ledger from "Ravi Kumar".
    expect(personKey("Ravi  Kumar")).toBe(personKey("Ravi Kumar"));
    expect(personKey("Ravi\tKumar")).toBe(personKey("Ravi Kumar"));
  });

  it("keeps genuinely different names apart — merging those is the USER's call", () => {
    expect(personKey("Ravi")).not.toBe(personKey("Ravi Kumar"));
    expect(personKey("Ravi K")).not.toBe(personKey("Ravi.K"));
    expect(personKey("Meera")).not.toBe(personKey("Meena"));
  });

  it("normalises a blank name to an empty key rather than throwing", () => {
    expect(personKey("   ")).toBe("");
  });

  it("is idempotent — normalising an already-normalised name changes nothing", () => {
    for (const name of ["Ravi", "  Ravi  Kumar ", "MEERA S"]) {
      expect(personKey(personKey(name))).toBe(personKey(name));
    }
  });
});

/**
 * ledgerKey decides which balance an entry lands on. The fallback path is what
 * keeps entries written BEFORE the People registry visible on the right person
 * until `backfill:people` runs — without it they would surface as phantom
 * duplicates alongside their own Person record.
 */
describe("ledgerKey — which balance an entry belongs to", () => {
  const index = new Map([["ravi", "p1"]]);

  it("uses the person reference when the entry has one", () => {
    expect(ledgerKey({ personRef: "p1", person: "anything at all" }, index)).toBe("id:p1");
  });

  it("prefers the reference even when the stored name has drifted", () => {
    // The snapshot name is stale after a rename; identity still resolves.
    expect(ledgerKey({ personRef: "p1", person: "Old Name" }, index)).toBe(
      ledgerKey({ personRef: "p1", person: "New Name" }, index)
    );
  });

  it("falls back to matching a legacy entry onto its Person by name", () => {
    // A pre-backfill row typed "Ravi" groups with Person p1, not as a new ledger.
    expect(ledgerKey({ person: "Ravi" }, index)).toBe("id:p1");
    expect(ledgerKey({ person: "  ravi " }, index)).toBe("id:p1");
  });

  it("groups a legacy entry with the referenced entries for the same person", () => {
    expect(ledgerKey({ person: "Ravi" }, index)).toBe(ledgerKey({ personRef: "p1", person: "Ravi" }, index));
  });

  it("keeps an unmatched legacy name in its own ledger", () => {
    expect(ledgerKey({ person: "Stranger" }, index)).toBe("name:stranger");
  });

  it("never lets an id collide with a name", () => {
    // A person literally named "p1" must not land on the ledger of person id p1.
    expect(ledgerKey({ person: "p1" }, index)).toBe("name:p1");
    expect(ledgerKey({ person: "p1" }, index)).not.toBe(ledgerKey({ personRef: "p1", person: "x" }, index));
  });

  it("works with no index at all (nothing to match against yet)", () => {
    expect(ledgerKey({ person: "Ravi" })).toBe("name:ravi");
    expect(ledgerKey({ personRef: "p1", person: "Ravi" })).toBe("id:p1");
  });
});
