import type { Request, Response } from "express";
import { Goal } from "../models/Goal";
import { goalSchema, goalUpdateSchema, goalContributeSchema } from "../validators/schemas";
import {
  applyContribution,
  assertAccountLinkable,
  linkedBalance,
  linkedHoldingValue,
  nextAchievedAt,
  withLinkedBalances,
} from "../services/goalService";
import {
  closeCycleNow,
  fundingByGoal,
  projectionFor,
  rollDueGoalCycles,
  type GoalFunding,
} from "../services/goalCycleService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/**
 * Attach derived progress to a goal: how far along it is, and — from the rules
 * actually paying into it — when it should get there and whether that beats the
 * target date. `funding` is optional; without it the planned monthly figure is
 * used, which is all an un-automated goal has.
 */
function withProgress(goal: Record<string, unknown>, funding?: GoalFunding, now = new Date()) {
  const target = Number(goal.targetAmount ?? 0);
  const saved = Number(goal.savedAmount ?? 0);
  const remaining = Math.max(target - saved, 0);
  const percent = target > 0 ? Math.min(Math.round((saved / target) * 100), 100) : 0;
  const complete = target > 0 && saved >= target;
  const projection = projectionFor(
    {
      savedAmount: saved,
      targetAmount: target,
      targetDate: goal.targetDate as Date | null,
      monthlyContribution: Number(goal.monthlyContribution ?? 0),
      linkedHolding: goal.linkedHolding,
    },
    funding,
    now
  );
  const monthsLeft =
    !complete && projection.fundedMonthly > 0 ? Math.ceil(remaining / projection.fundedMonthly) : null;
  return {
    ...goal,
    // Goals saved before repeating cycles existed have no `repeat` at all.
    repeat: goal.repeat ?? "none",
    cycleCount: goal.cycleCount ?? 1,
    cycles: goal.cycles ?? [],
    remaining,
    percent,
    complete,
    monthsLeft,
    ...projection,
  };
}

export async function listGoals(req: Request, res: Response) {
  const uid = userId(req);
  // Turn over any repeating goal that came due, so opening the page shows the new
  // cycle rather than a finished one waiting on tomorrow's sweep.
  await rollDueGoalCycles(new Date(), uid);
  const goals = await Goal.find({ user: uid })
    .sort({ createdAt: -1 })
    .populate("linkedAccount", "name icon color type")
    .populate("linkedHolding", "name subtype value termCount")
    .lean();
  // A linked goal's saved total is its wallet's live balance, resolved here so
  // every caller (list, dashboard, the goal card) sees the same number.
  const resolved = await withLinkedBalances(
    goals.map((g) => ({ ...g, linkedAccount: g.linkedAccount, linkedHolding: g.linkedHolding })),
    uid
  );
  const funding = await fundingByGoal(resolved, uid);
  res.json(resolved.map((g) => withProgress(g, funding.get(String(g._id)))));
}

/**
 * One goal, ready for the client: the stored document with its wallet balance
 * swapped in when it tracks one, plus the derived progress fields.
 */
async function respondWith(res: Response, goal: { toObject: () => Record<string, unknown> }, uid: string) {
  const obj = goal.toObject();
  if (obj.linkedAccount) obj.savedAmount = await linkedBalance(obj.linkedAccount, uid);
  else if (obj.linkedHolding) obj.savedAmount = await linkedHoldingValue(obj.linkedHolding, uid);
  const funding = await fundingByGoal(
    [{ _id: obj._id, linkedAccount: obj.linkedAccount, linkedHolding: obj.linkedHolding }],
    uid
  );
  res.json(withProgress(obj, funding.get(String(obj._id))));
}

export async function createGoal(req: Request, res: Response) {
  const uid = userId(req);
  const data = goalSchema.parse(req.body);
  await assertAccountLinkable(data.linkedAccount, uid);
  const goal = await Goal.create({ ...data, user: uid });
  const obj = goal.toObject();
  if (obj.linkedAccount) obj.savedAmount = await linkedBalance(obj.linkedAccount, uid);
  res.status(201).json(withProgress(obj));

}

export async function updateGoal(req: Request, res: Response) {
  const uid = userId(req);
  const data = goalUpdateSchema.parse(req.body);
  const goal = await Goal.findOne({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");
  if (data.linkedAccount !== undefined) await assertAccountLinkable(data.linkedAccount, uid, goal._id);

  // Unlinking keeps the number the user last saw: the wallet's balance becomes
  // the goal's own stored total, rather than snapping back to a stale figure.
  if (data.linkedAccount === null && goal.linkedAccount) {
    goal.savedAmount = await linkedBalance(goal.linkedAccount, uid);
  }
  Object.assign(goal, data);
  // Editing savedAmount/targetAmount can cross the finish line just like a
  // contribution does — keep achievedAt in step so the persisted date isn't stale.
  const saved = goal.linkedAccount ? await linkedBalance(goal.linkedAccount, uid) : goal.savedAmount;
  goal.achievedAt = nextAchievedAt(saved, goal.targetAmount, goal.achievedAt ?? null, new Date());
  await goal.save();
  await respondWith(res, goal, uid);
}

/** Add (or subtract, if negative) an amount to the goal's saved total. */
export async function contributeGoal(req: Request, res: Response) {
  const uid = userId(req);
  const { amount } = goalContributeSchema.parse(req.body);
  const goal = await Goal.findOne({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");
  // Money reaches a wallet-tracking goal by landing in the wallet, and a
  // deposit-tracking goal by an instalment being paid. Adding here as well would
  // show the same rupees twice, so send the user to the thing that moves it.
  if (goal.linkedAccount) {
    throw new HttpError(400, "This goal tracks an account", "GOAL_TRACKS_ACCOUNT");
  }
  if (goal.linkedHolding) {
    throw new HttpError(400, "This goal tracks a deposit", "GOAL_TRACKS_DEPOSIT");
  }

  const next = applyContribution(
    { savedAmount: goal.savedAmount ?? 0, targetAmount: goal.targetAmount, achievedAt: goal.achievedAt ?? null },
    amount,
    new Date()
  );
  goal.savedAmount = next.savedAmount;
  goal.achievedAt = next.achievedAt;
  await goal.save();
  res.json(withProgress(goal.toObject()));
}

/**
 * Close a repeating goal's current cycle now and open the next one — for the
 * premium paid before its due date. A one-time goal has no cycle to close.
 */
export async function rollGoalCycle(req: Request, res: Response) {
  const uid = userId(req);
  const goal = await Goal.findOne({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");
  const rolled = await closeCycleNow(goal, uid);
  if (!rolled) throw new HttpError(400, "This goal doesn't repeat", "GOAL_NOT_REPEATING");
  await goal.save();
  await respondWith(res, goal, uid);
}

export async function deleteGoal(req: Request, res: Response) {
  const uid = userId(req);
  const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");
  res.json({ ok: true });
}
