import { Goal, type GoalDoc } from "../models/Goal";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { linkedBalance } from "./goalService";
import {
  isCycleDue,
  rollCycle,
  rollForward,
  type CycleState,
  type GoalRepeat,
  type RolledCycle,
} from "./goalCycles";
import {
  monthlyFunding,
  projectedCompletion,
  scheduleVerdict,
  type Frequency,
} from "./goalFunding";

/**
 * The database side of repeating goals and funding projections. The arithmetic
 * lives in goalCycles/goalFunding; this module only reads and writes.
 */

/** How many finished cycles a goal keeps. Enough to see a decade of a yearly fund. */
const HISTORY_LIMIT = 24;

/** A loaded goal document — hydrated, so it can be saved after a roll. */
type GoalWithId = GoalDoc & { _id: unknown; save: () => Promise<unknown> };

/** Read a goal into the shape the pure cycle rules expect. */
async function cycleStateOf(goal: GoalWithId, uid: string): Promise<CycleState> {
  return {
    repeat: (goal.repeat ?? "none") as GoalRepeat,
    targetDate: goal.targetDate ? new Date(goal.targetDate) : null,
    savedAmount: goal.linkedAccount ? await linkedBalance(goal.linkedAccount, uid) : goal.savedAmount ?? 0,
    targetAmount: goal.targetAmount,
    linked: Boolean(goal.linkedAccount),
  };
}

/** Write the outcome of one or more rolls back onto the goal. */
function applyRolls(goal: GoalWithId, rolls: RolledCycle[]): void {
  for (const roll of rolls) {
    goal.cycles.push({
      index: goal.cycleCount ?? 1,
      targetAmount: roll.closed.targetAmount,
      savedAmount: roll.closed.savedAmount,
      closedAt: roll.closed.closedAt,
    });
    goal.cycleCount = (goal.cycleCount ?? 1) + 1;
  }
  const last = rolls[rolls.length - 1];
  goal.targetDate = last.targetDate;
  // Only an unlinked goal's counter moves — a wallet-tracking goal's total is
  // its account balance, which the premium payment has already changed.
  if (!goal.linkedAccount) goal.savedAmount = last.savedAmount;
  // A fresh cycle hasn't been achieved yet, whatever the last one managed.
  goal.achievedAt = null;
  if (goal.cycles.length > HISTORY_LIMIT) {
    goal.cycles.splice(0, goal.cycles.length - HISTORY_LIMIT);
  }
}

/**
 * Close a repeating goal's current cycle immediately — for a premium paid before
 * its due date. Returns false for a goal that doesn't repeat.
 */
export async function closeCycleNow(goal: GoalWithId, uid: string, now = new Date()): Promise<boolean> {
  const state = await cycleStateOf(goal, uid);
  const roll = rollCycle(state, now);
  if (!roll) return false;
  applyRolls(goal, [roll]);
  return true;
}

/**
 * Roll every repeating goal whose due date has arrived. Idempotent by date: a
 * goal already rolled has a future target date, so a second run does nothing.
 * Returns the goals that moved, for the notification sweep.
 *
 * Runs daily for everyone, and for one user when they open their goals — so a
 * cycle turns over the moment it's due rather than at the next sweep.
 */
export async function rollDueGoalCycles(
  now: Date = new Date(),
  uid?: string
): Promise<{ goal: GoalWithId; cycles: number }[]> {
  const due = await Goal.find({
    ...(uid ? { user: uid } : {}),
    repeat: { $ne: "none" },
    targetDate: { $ne: null, $lte: now },
  });

  const rolled: { goal: GoalWithId; cycles: number }[] = [];
  for (const goal of due as GoalWithId[]) {
    const uid = String(goal.user);
    const state = await cycleStateOf(goal, uid);
    if (!isCycleDue(state, now)) continue;
    const rolls = rollForward(state, now);
    if (!rolls.length) continue;
    applyRolls(goal, rolls);
    await goal.save();
    rolled.push({ goal, cycles: rolls.length });
  }
  return rolled;
}

export interface GoalFunding {
  /** Combined monthly inflow from the rules paying into this goal. */
  monthly: number;
  /** How many active rules that is — the client says "from 2 rules". */
  rules: number;
}

/**
 * What each goal is actually being fed per month, from active recurring rules:
 * a rule tagged with the goal, or — for a wallet-tracking goal — a rule that pays
 * INTO its account. Only inflows count; money leaving the wallet is spending, not
 * negative saving, and shows up in the balance anyway.
 */
export async function fundingByGoal(
  goals: { _id: unknown; linkedAccount?: unknown; linkedHolding?: unknown }[],
  uid: string
): Promise<Map<string, GoalFunding>> {
  const out = new Map<string, GoalFunding>();
  if (!goals.length) return out;

  const accountOf = new Map<string, string>(); // linked account id -> goal id
  for (const g of goals) {
    const link = g.linkedAccount as { _id?: unknown } | string | null | undefined;
    const id = link && typeof link === "object" && "_id" in link ? String(link._id) : link ? String(link) : "";
    if (id) accountOf.set(id, String(g._id));
  }
  // A deposit-tracking goal is funded by the deposit's own instalment. Without
  // this the card says "nothing paying in yet" about a goal that is being paid
  // into every month, which is simply untrue.
  const holdingOf = new Map<string, string>(); // linked holding id -> goal id
  for (const g of goals) {
    const link = g.linkedHolding as { _id?: unknown } | string | null | undefined;
    const id = link && typeof link === "object" && "_id" in link ? String(link._id) : link ? String(link) : "";
    if (id) holdingOf.set(id, String(g._id));
  }

  const goalIds = goals.map((g) => String(g._id));
  const accountIds = [...accountOf.keys()];
  const holdingIds = [...holdingOf.keys()];

  const rules = await RecurringTransaction.find({
    user: uid,
    active: true,
    $or: [
      { goal: { $in: goalIds } },
      ...(accountIds.length
        ? [{ toAccount: { $in: accountIds } }, { account: { $in: accountIds }, type: "income" }]
        : []),
      ...(holdingIds.length ? [{ holding: { $in: holdingIds } }] : []),
    ],
  }).lean();

  const byGoal = new Map<string, { amount: number; frequency: Frequency; interval?: number | null }[]>();
  const add = (goalId: string, rule: { amount: number; frequency: string; interval?: number | null }) => {
    const list = byGoal.get(goalId) ?? [];
    list.push({ amount: rule.amount, frequency: rule.frequency as Frequency, interval: rule.interval });
    byGoal.set(goalId, list);
  };

  for (const rule of rules) {
    if (rule.goal && goalIds.includes(String(rule.goal))) add(String(rule.goal), rule);
    const into = rule.type === "transfer" ? rule.toAccount : rule.type === "income" ? rule.account : null;
    const linkedGoal = into ? accountOf.get(String(into)) : undefined;
    if (linkedGoal) add(linkedGoal, rule);
    const depositGoal = rule.holding ? holdingOf.get(String(rule.holding)) : undefined;
    if (depositGoal) add(depositGoal, rule);
  }

  for (const [goalId, list] of byGoal) {
    out.set(goalId, { monthly: monthlyFunding(list), rules: list.length });
  }
  return out;
}

/** Projection fields for one goal, given what's funding it. */
export function projectionFor(
  goal: {
    savedAmount: number;
    targetAmount: number;
    targetDate?: Date | string | null;
    monthlyContribution?: number;
    linkedHolding?: unknown;
  },
  funding: GoalFunding | undefined,
  now: Date = new Date()
) {
  // Real rules beat the planned figure; the typed number is the fallback for a
  // goal nobody has automated yet.
  const fundedMonthly = funding?.monthly || goal.monthlyContribution || 0;
  const remaining = Math.max(goal.targetAmount - goal.savedAmount, 0);
  const targetDate = goal.targetDate ? new Date(goal.targetDate) : null;

  // A deposit-tracking goal finishes on its last instalment by construction:
  // the target IS the instalments added up and the deadline IS the last one.
  // Dividing what's left by a monthly rate and comparing the answer to the
  // deadline compares the plan to itself, and lands a month out whenever the
  // first instalment isn't due today — "Behind 1 mo" about a deposit that is
  // running exactly to plan.
  const projectedDate =
    goal.linkedHolding && targetDate && remaining > 0
      ? targetDate
      : projectedCompletion(remaining, fundedMonthly, now);
  return {
    fundedMonthly,
    fundedByRules: funding?.rules ?? 0,
    projectedDate: projectedDate ? projectedDate.toISOString() : null,
    schedule: scheduleVerdict(projectedDate, targetDate),
  };
}
