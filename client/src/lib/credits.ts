import type { CreditPersonSummary } from "@/lib/types";

/**
 * Settlement is DERIVED, not stored: a person is square when everything you gave
 * them has come back (or vice versa). There is no `settled` flag on the Credit
 * model — see server/src/models/Credit.ts, where a credit is a one-way ledger
 * entry rather than a debt with a status.
 */

/**
 * Half a paisa. `given - received` on decimal amounts leaves float dust like
 * 1e-10, and a bare `!== 0` would keep such a person "open" forever.
 */
export const SETTLED_EPSILON = 0.005;

export interface SettledPerson extends CreditPersonSummary {
  /** The amount that went round and came back — `given` and `received` are equal here. */
  cycled: number;
  /** ISO date of the newest entry: when the balance reached zero. */
  closedOn: string;
}

export function isSettled(person: Pick<CreditPersonSummary, "net">): boolean {
  return Math.abs(person.net) < SETTLED_EPSILON;
}

/**
 * Split the credit summary into people who still owe (or are owed) and people
 * who are square.
 *
 * `active` keeps the order the server already sorted it into (largest |net|
 * first). `settled` is re-sorted most-recently-closed first — a debt squared
 * last week is more interesting than one from a year ago.
 */
export function partitionCredits(people: CreditPersonSummary[]): {
  active: CreditPersonSummary[];
  settled: SettledPerson[];
} {
  const active: CreditPersonSummary[] = [];
  const settled: SettledPerson[] = [];

  for (const p of people) {
    if (!isSettled(p)) {
      active.push(p);
      continue;
    }
    settled.push({
      ...p,
      // Equal to `received` too, by definition of settled — `given` just reads
      // more naturally as "the amount that went out and came back".
      cycled: p.given,
      // listCredits sorts { date: -1, createdAt: -1 }, so entry 0 is the newest.
      closedOn: p.entries[0]?.date ?? "",
    });
  }

  settled.sort((a, b) => b.closedOn.localeCompare(a.closedOn));
  return { active, settled };
}
