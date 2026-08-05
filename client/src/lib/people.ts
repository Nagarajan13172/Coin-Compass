import type { CreditPersonSummary, Person } from "@/lib/types";

/**
 * The identity rule, mirroring personKey() on the server. It must agree exactly:
 * the picker decides whether to offer "add Ravi" based on this, and the server
 * decides whether to create a record based on its copy. If they disagree, the
 * UI offers to create someone who already exists.
 */
export function personKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * People matching what's been typed, best first.
 *
 * Ranked so the obvious answer is first for an Enter press: an exact name, then
 * names starting with the query, then names merely containing it. An empty query
 * lists everyone, which is what makes the picker usable as a plain browse.
 */
export function matchPeople(people: Person[], query: string): Person[] {
  const q = personKey(query);
  if (!q) return [...people].sort((a, b) => a.name.localeCompare(b.name));

  const rank = (p: Person): number => {
    const key = personKey(p.name);
    if (key === q) return 0;
    if (key.startsWith(q)) return 1;
    if (key.includes(q)) return 2;
    return 3;
  };

  return people
    .map((p) => ({ p, r: rank(p) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.p.name.localeCompare(b.p.name))
    .map((x) => x.p);
}

/** Whether a typed name already belongs to someone — suppresses the "add" row. */
export function isExactPersonMatch(people: Person[], query: string): boolean {
  const q = personKey(query);
  return q.length > 0 && people.some((p) => personKey(p.name) === q);
}

/**
 * People who don't yet have a record — legacy ledgers from before the registry,
 * or someone whose person was force-deleted. Surfaced in Settings so they can be
 * linked up rather than sitting invisible.
 */
export function unlinkedLedgers(summary: CreditPersonSummary[]): CreditPersonSummary[] {
  return summary.filter((s) => !s.personId);
}

/**
 * Pairs that look like the same person typed two ways — one name is the other
 * plus more words ("Ravi" / "Ravi Kumar"). Only ever a SUGGESTION to merge:
 * combining two ledgers changes who owes what, so it stays the user's call.
 */
export function likelyDuplicates(people: Person[]): [Person, Person][] {
  const pairs: [Person, Person][] = [];
  const sorted = [...people].sort((a, b) => personKey(a.name).localeCompare(personKey(b.name)));
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (personKey(sorted[j].name).startsWith(`${personKey(sorted[i].name)} `)) {
        pairs.push([sorted[i], sorted[j]]);
      }
    }
  }
  return pairs;
}
