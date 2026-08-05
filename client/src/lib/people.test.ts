import { describe, it, expect } from "vitest";
import { personKey, matchPeople, isExactPersonMatch, unlinkedLedgers, likelyDuplicates } from "./people";
import type { CreditPersonSummary, Person } from "@/lib/types";

const person = (name: string, id = name.toLowerCase()): Person =>
  ({ _id: id, name, key: personKey(name), relation: "other" }) as Person;

const PEOPLE = [
  person("Ravi"),
  person("Ravi Kumar"),
  person("Meera"),
  person("Arjun Balan"),
];

/**
 * This must agree EXACTLY with personKey() on the server. If the two drift, the
 * picker offers to "add Ravi" for someone who already exists, and the server
 * quietly attaches the entry to the existing record instead — the UI would be
 * telling the user something false.
 */
describe("personKey — mirrors the server's identity rule", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(personKey("  RAVI  ")).toBe(personKey("ravi"));
  });

  it("collapses internal whitespace", () => {
    expect(personKey("Ravi  Kumar")).toBe(personKey("Ravi Kumar"));
  });

  it("keeps genuinely different names apart", () => {
    expect(personKey("Ravi")).not.toBe(personKey("Ravi Kumar"));
  });

  it("maps a blank name to an empty key", () => {
    expect(personKey("   ")).toBe("");
  });
});

describe("matchPeople — what the picker shows as you type", () => {
  it("lists everyone alphabetically for an empty query", () => {
    expect(matchPeople(PEOPLE, "").map((p) => p.name)).toEqual([
      "Arjun Balan",
      "Meera",
      "Ravi",
      "Ravi Kumar",
    ]);
  });

  it("puts an exact match first, ahead of the longer name it prefixes", () => {
    // Typing "Ravi" must offer Ravi before Ravi Kumar — Enter picks the first.
    expect(matchPeople(PEOPLE, "Ravi").map((p) => p.name)).toEqual(["Ravi", "Ravi Kumar"]);
  });

  it("ranks prefix matches above mid-name matches", () => {
    const rows = matchPeople([person("Balan Raj"), person("Arjun Balan")], "balan");
    expect(rows.map((p) => p.name)).toEqual(["Balan Raj", "Arjun Balan"]);
  });

  it("is case- and spacing-insensitive", () => {
    expect(matchPeople(PEOPLE, "  rAvI kUmAr ").map((p) => p.name)).toEqual(["Ravi Kumar"]);
    expect(matchPeople(PEOPLE, "ravi  kumar").map((p) => p.name)).toEqual(["Ravi Kumar"]);
  });

  it("returns nothing for a name nobody has", () => {
    expect(matchPeople(PEOPLE, "Zubair")).toEqual([]);
  });

  it("handles an empty roster", () => {
    expect(matchPeople([], "Ravi")).toEqual([]);
    expect(matchPeople([], "")).toEqual([]);
  });
});

describe("isExactPersonMatch — whether to offer 'add this name'", () => {
  it("is true for a name that already exists, however typed", () => {
    for (const q of ["Ravi", "ravi", "  RAVI  "]) {
      expect(isExactPersonMatch(PEOPLE, q)).toBe(true);
    }
  });

  it("is false for a new name, even one that merely starts an existing one", () => {
    expect(isExactPersonMatch(PEOPLE, "Rav")).toBe(false);
    expect(isExactPersonMatch(PEOPLE, "Ravi K")).toBe(false);
  });

  it("is false for a blank query — there is nothing to add", () => {
    expect(isExactPersonMatch(PEOPLE, "")).toBe(false);
    expect(isExactPersonMatch(PEOPLE, "   ")).toBe(false);
  });
});

describe("unlinkedLedgers — balances with no person record yet", () => {
  const row = (person: string, personId: string | null): CreditPersonSummary =>
    ({
      person,
      personId,
      relation: null,
      given: 0,
      received: 0,
      borrowed: 0,
      repaid: 0,
      net: 0,
      entries: [],
    }) as CreditPersonSummary;

  it("picks out only the ledgers missing a record", () => {
    const rows = [row("Ravi", "p1"), row("Legacy Guy", null), row("Meera", "p2")];
    expect(unlinkedLedgers(rows).map((r) => r.person)).toEqual(["Legacy Guy"]);
  });

  it("is empty once everything is linked", () => {
    expect(unlinkedLedgers([row("Ravi", "p1")])).toEqual([]);
  });
});

describe("likelyDuplicates — merge suggestions, never automatic", () => {
  it("pairs a name with the longer name that extends it", () => {
    const pairs = likelyDuplicates(PEOPLE);
    expect(pairs.map(([a, b]) => [a.name, b.name])).toEqual([["Ravi", "Ravi Kumar"]]);
  });

  it("does not pair merely similar names", () => {
    expect(likelyDuplicates([person("Meera"), person("Meena")])).toEqual([]);
  });

  it("does not pair a name that is a prefix mid-word", () => {
    // "Ram" prefixes "Ramesh" as text, but not at a word boundary — different people.
    expect(likelyDuplicates([person("Ram"), person("Ramesh")])).toEqual([]);
  });

  it("finds several extensions of the same base name", () => {
    const pairs = likelyDuplicates([person("Ravi"), person("Ravi Kumar"), person("Ravi Shankar")]);
    expect(pairs.map(([a, b]) => [a.name, b.name])).toEqual([
      ["Ravi", "Ravi Kumar"],
      ["Ravi", "Ravi Shankar"],
    ]);
  });

  it("is empty for a clean roster", () => {
    expect(likelyDuplicates([person("Ravi"), person("Meera")])).toEqual([]);
    expect(likelyDuplicates([])).toEqual([]);
  });
});
