import { describe, it, expect } from "vitest";
import { SETTLED_EPSILON, isSettled, partitionCredits } from "./credits";
import type { Credit, CreditPersonSummary } from "@/lib/types";

/**
 * partitionCredits decides who is still owed money and who is square. Getting it
 * wrong either hides a live debt or keeps a closed one on the page forever, so
 * these specs assert the invariants: nothing lost, float dust ignored, and the
 * derived `cycled` / `closedOn` read off the right entry.
 */

const entry = (date: string, direction: "given" | "received", amount: number): Credit =>
  ({
    _id: `${date}-${direction}-${amount}`,
    person: "x",
    direction,
    amount,
    date,
    method: "Cash",
    account: null,
    note: "",
    reflected: false,
  }) as unknown as Credit;

/** Entries arrive newest-first from the server; mirror that in the fixtures. */
const person = (
  name: string,
  given: number,
  received: number,
  entries: Credit[] = []
): CreditPersonSummary => ({
  person: name,
  given,
  received,
  net: given - received,
  entries,
});

describe("partitionCredits — nothing lost", () => {
  it("puts every person in exactly one bucket", () => {
    const people = [
      person("Hari", 11000, 0),
      person("Murali", 10000, 10000),
      person("Ponmathi", 2214, 1000),
      person("Maddi", 500, 500),
    ];
    const { active, settled } = partitionCredits(people);
    expect(active).toHaveLength(2);
    expect(settled).toHaveLength(2);

    const names = [...active, ...settled].map((p) => p.person).sort();
    expect(names).toEqual(["Hari", "Maddi", "Murali", "Ponmathi"]);
  });

  it("keeps both directions of debt active", () => {
    const { active, settled } = partitionCredits([
      person("OwesMe", 500, 0), // net +500
      person("IOwe", 0, 500), // net −500
    ]);
    expect(active.map((p) => p.person)).toEqual(["OwesMe", "IOwe"]);
    expect(settled).toEqual([]);
  });

  it("returns two empty arrays for empty input", () => {
    expect(partitionCredits([])).toEqual({ active: [], settled: [] });
  });
});

describe("partitionCredits — settled detection", () => {
  it("treats float dust as settled", () => {
    // 0.1 + 0.2 style drift: a bare `net !== 0` would keep this person open forever.
    const p = { ...person("Dust", 0.3, 0.1 + 0.2), net: 0.3 - (0.1 + 0.2) };
    expect(p.net).not.toBe(0); // guard: the fixture really is dusty
    expect(isSettled(p)).toBe(true);
    expect(partitionCredits([p]).settled).toHaveLength(1);
  });

  it("does not treat a real one-paisa balance as settled", () => {
    const p = person("Paisa", 100.01, 100);
    expect(isSettled(p)).toBe(false);
    expect(partitionCredits([p]).active).toHaveLength(1);
  });

  it("uses a half-paisa threshold", () => {
    expect(isSettled({ net: SETTLED_EPSILON })).toBe(false);
    expect(isSettled({ net: -SETTLED_EPSILON })).toBe(false);
    expect(isSettled({ net: SETTLED_EPSILON / 2 })).toBe(true);
  });

  it("settles a person who cycled money several times", () => {
    const { settled } = partitionCredits([person("Loop", 3000, 3000)]);
    expect(settled).toHaveLength(1);
    expect(settled[0].cycled).toBe(3000);
  });
});

describe("partitionCredits — derived fields", () => {
  it("reports cycled as the amount that went out, which equals what came back", () => {
    const p = person("Murali", 10000, 10000);
    const { settled } = partitionCredits([p]);
    expect(settled[0].cycled).toBe(p.given);
    expect(settled[0].cycled).toBe(p.received);
  });

  it("takes closedOn from the newest entry, not the oldest", () => {
    const { settled } = partitionCredits([
      person("Murali", 10000, 10000, [
        entry("2026-07-30", "received", 10000),
        entry("2026-07-09", "given", 10000),
      ]),
    ]);
    expect(settled[0].closedOn).toBe("2026-07-30");
  });

  it("survives a person with no entries rather than throwing", () => {
    const { settled } = partitionCredits([person("Ghost", 0, 0, [])]);
    expect(settled[0].closedOn).toBe("");
  });
});

describe("partitionCredits — ordering", () => {
  it("lists settled people most-recently-closed first", () => {
    const { settled } = partitionCredits([
      person("Old", 1, 1, [entry("2026-01-05", "received", 1)]),
      person("New", 1, 1, [entry("2026-07-30", "received", 1)]),
      person("Mid", 1, 1, [entry("2026-04-12", "received", 1)]),
    ]);
    expect(settled.map((p) => p.person)).toEqual(["New", "Mid", "Old"]);
  });

  it("leaves the active order exactly as the server sorted it", () => {
    const people = [person("Big", 11000, 0), person("Small", 2214, 1000)];
    expect(partitionCredits(people).active.map((p) => p.person)).toEqual(["Big", "Small"]);
  });
});
