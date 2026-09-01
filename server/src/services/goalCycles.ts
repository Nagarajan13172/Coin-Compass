import { addMonths, addYears } from "../utils/dateRange";

/**
 * Repeating goals — the sinking-fund case. A yearly insurance premium isn't one
 * goal you finish; it's the same goal every year: save ₹12,000 by February, pay
 * it, start again. These helpers own when a cycle ends and what carries into the
 * next one. Pure and DB-free so the rules can be tested directly.
 */

export const GOAL_REPEATS = ["none", "monthly", "quarterly", "yearly"] as const;
export type GoalRepeat = (typeof GOAL_REPEATS)[number];

/** The end of the cycle that starts at `from`, or null for a one-time goal. */
export function nextCycleEnd(from: Date, repeat: GoalRepeat): Date | null {
  switch (repeat) {
    case "monthly":
      return addMonths(from, 1);
    case "quarterly":
      return addMonths(from, 3);
    case "yearly":
      return addYears(from, 1);
    default:
      return null;
  }
}

export interface CycleState {
  repeat: GoalRepeat;
  targetDate: Date | null;
  savedAmount: number;
  targetAmount: number;
  /** True when progress mirrors an account balance rather than a stored total. */
  linked: boolean;
}

/**
 * A repeating goal rolls once its target date has arrived — that's the day the
 * money is due to be spent. A one-time goal never rolls, and a repeating goal
 * without a target date has no cycle to end.
 */
export function isCycleDue(goal: CycleState, now: Date): boolean {
  if (goal.repeat === "none" || !goal.targetDate) return false;
  return now.getTime() >= goal.targetDate.getTime();
}

export interface RolledCycle {
  /** What the finished cycle held, for the goal's history. */
  closed: { targetAmount: number; savedAmount: number; closedAt: Date };
  /** Where the new cycle's saved total starts. */
  savedAmount: number;
  /** The next due date; cycles chain from the old target date, not from today,
   *  so a premium due every 12 February stays on the 12th. */
  targetDate: Date;
}

/**
 * Close the current cycle and open the next.
 *
 * A linked goal's total isn't ours to change — the wallet is the record, and if
 * the premium was paid from it the balance already fell. An unlinked goal's
 * counter gives up exactly one target's worth: that money was the point of the
 * cycle and has been spent, while anything saved beyond it carries forward.
 */
export function rollCycle(goal: CycleState, now: Date): RolledCycle | null {
  if (!goal.targetDate) return null;
  const end = nextCycleEnd(goal.targetDate, goal.repeat);
  if (!end) return null;

  return {
    closed: { targetAmount: goal.targetAmount, savedAmount: goal.savedAmount, closedAt: now },
    savedAmount: goal.linked ? goal.savedAmount : Math.max(0, goal.savedAmount - goal.targetAmount),
    targetDate: end,
  };
}

/**
 * Catch a goal up when several cycles have passed unnoticed — a server that was
 * off for two months, or a goal nobody opened for a year. Each pass consumes one
 * target, so the arithmetic matches having rolled on time. Capped so a stale goal
 * with a daily-ish cycle can't spin.
 */
export function rollForward(goal: CycleState, now: Date, maxCycles = 60): RolledCycle[] {
  const rolled: RolledCycle[] = [];
  let state = { ...goal };
  while (isCycleDue(state, now) && rolled.length < maxCycles) {
    const next = rollCycle(state, now);
    if (!next) break;
    rolled.push(next);
    state = { ...state, savedAmount: next.savedAmount, targetDate: next.targetDate };
  }
  return rolled;
}
