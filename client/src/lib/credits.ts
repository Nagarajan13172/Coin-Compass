import type { CreditDirection, CreditPersonSummary } from "@/lib/types";

/**
 * How each direction is coloured and signed, defined once so the form, the entry
 * rows and any future surface can't drift apart.
 *
 * Four directions need four colours. Red/green alone can't carry it: "you
 * received" and "you borrowed" both put money in your hand, and "you gave" and
 * "you repaid" both take it out — so tone has to encode the DEBT, not the cash:
 *
 *   given    red     money out, they now owe you
 *   received green   money in, a debt to you cleared
 *   borrowed amber   money in — but you now owe it (caution, not gain)
 *   repaid   indigo  money out — clearing your own debt, not spending
 *
 * `sign` follows the cash, so the amount still reads the way the ledger moves.
 */
export interface DirectionTone {
  /** Colour of the amount text. */
  amount: string;
  /** Icon bubble background + foreground. */
  bubble: string;
  /** Filled style when this direction is the selected one in a picker. */
  active: string;
  sign: "+" | "−";
}

export const DIRECTION_TONE: Record<CreditDirection, DirectionTone> = {
  given: {
    amount: "text-expense",
    bubble: "bg-expense/10 text-expense",
    active: "data-[active=true]:bg-expense data-[active=true]:text-expense-foreground",
    sign: "−",
  },
  received: {
    amount: "text-income",
    bubble: "bg-income/10 text-income",
    active: "data-[active=true]:bg-income data-[active=true]:text-income-foreground",
    sign: "+",
  },
  borrowed: {
    amount: "text-amber-600 dark:text-amber-400",
    bubble: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    active: "data-[active=true]:bg-amber-500 data-[active=true]:text-white",
    sign: "+",
  },
  repaid: {
    amount: "text-indigo-600 dark:text-indigo-400",
    bubble: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
    active: "data-[active=true]:bg-indigo-500 data-[active=true]:text-white",
    sign: "−",
  },
};

/** The tone for a direction, falling back to `given` for unknown values. */
export function directionTone(direction: CreditDirection): DirectionTone {
  return DIRECTION_TONE[direction] ?? DIRECTION_TONE.given;
}

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
