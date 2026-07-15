import { Goal } from "../models/Goal";

/**
 * When a goal has just crossed (or fallen back below) its target, return the
 * achievedAt date it should carry: keep an existing stamp, set `now` the moment
 * saved first reaches the target, or clear it if saved drops back under.
 * Pure — the single source of truth for goal "completion" across every path
 * (manual contribute, direct edit, and transaction/recurring-driven contributions).
 */
export function nextAchievedAt(
  savedAmount: number,
  targetAmount: number,
  current: Date | null,
  now: Date
): Date | null {
  if (targetAmount > 0 && savedAmount >= targetAmount) return current ?? now;
  return null; // no target, or dropped back below it
}

export interface GoalState {
  savedAmount: number;
  targetAmount: number;
  achievedAt: Date | null;
}

/**
 * Apply a `delta` (negative to withdraw) to a goal's saved total. savedAmount is
 * clamped at ≥ 0 and achievedAt is kept in step. Returns the new state plus the
 * ACTUAL applied delta (post-clamp) — so a linked transaction can store exactly
 * what was applied and reverse it precisely later. Pure and DB-free.
 */
export function applyContribution(
  state: GoalState,
  delta: number,
  now: Date
): { savedAmount: number; achievedAt: Date | null; applied: number } {
  const before = state.savedAmount;
  const savedAmount = Math.max(0, before + delta);
  return {
    savedAmount,
    achievedAt: nextAchievedAt(savedAmount, state.targetAmount, state.achievedAt, now),
    applied: savedAmount - before,
  };
}

/**
 * Add `amount` to a goal's saved total (a positive contribution, or negative to
 * correct/withdraw), persisting savedAmount + achievedAt. Returns the amount
 * actually applied so the caller can record it for an exact reversal; a no-op
 * (missing goal / zero amount) returns 0.
 */
export async function applyGoalContribution(
  goalId: unknown,
  userId: unknown,
  amount: number,
  now: Date = new Date()
): Promise<number> {
  if (!goalId || !amount) return 0;
  const goal = await Goal.findOne({ _id: goalId, user: userId });
  if (!goal) return 0;

  const next = applyContribution(
    { savedAmount: goal.savedAmount ?? 0, targetAmount: goal.targetAmount, achievedAt: goal.achievedAt ?? null },
    amount,
    now
  );
  goal.savedAmount = next.savedAmount;
  goal.achievedAt = next.achievedAt;
  await goal.save();
  return next.applied;
}

/** Reverse a previously-applied contribution: subtract exactly what was applied. */
export async function reverseGoalContribution(
  goalId: unknown,
  userId: unknown,
  applied: number,
  now: Date = new Date()
): Promise<void> {
  if (!goalId || !applied) return;
  await applyGoalContribution(goalId, userId, -applied, now);
}
