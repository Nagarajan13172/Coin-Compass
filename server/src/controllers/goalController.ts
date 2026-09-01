import type { Request, Response } from "express";
import { Goal } from "../models/Goal";
import { goalSchema, goalUpdateSchema, goalContributeSchema } from "../validators/schemas";
import {
  applyContribution,
  assertAccountLinkable,
  linkedBalance,
  nextAchievedAt,
  withLinkedBalances,
} from "../services/goalService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/** Attach derived progress fields (percent, remaining, ETA) to a goal. */
function withProgress(goal: Record<string, unknown>) {
  const target = Number(goal.targetAmount ?? 0);
  const saved = Number(goal.savedAmount ?? 0);
  const monthly = Number(goal.monthlyContribution ?? 0);
  const remaining = Math.max(target - saved, 0);
  const percent = target > 0 ? Math.min(Math.round((saved / target) * 100), 100) : 0;
  const complete = target > 0 && saved >= target;
  // Estimated months to reach the goal at the planned monthly contribution.
  const monthsLeft = !complete && monthly > 0 ? Math.ceil(remaining / monthly) : null;
  return { ...goal, remaining, percent, complete, monthsLeft };
}

export async function listGoals(req: Request, res: Response) {
  const uid = userId(req);
  const goals = await Goal.find({ user: uid }).sort({ createdAt: -1 }).populate("linkedAccount", "name icon color type").lean();
  // A linked goal's saved total is its wallet's live balance, resolved here so
  // every caller (list, dashboard, the goal card) sees the same number.
  const resolved = await withLinkedBalances(
    goals.map((g) => ({ ...g, linkedAccount: g.linkedAccount })),
    uid
  );
  res.json(resolved.map(withProgress));
}

/**
 * One goal, ready for the client: the stored document with its wallet balance
 * swapped in when it tracks one, plus the derived progress fields.
 */
async function respondWith(res: Response, goal: { toObject: () => Record<string, unknown> }, uid: string) {
  const obj = goal.toObject();
  if (obj.linkedAccount) obj.savedAmount = await linkedBalance(obj.linkedAccount, uid);
  res.json(withProgress(obj));
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
  // Money reaches a wallet-tracking goal by landing in the wallet. Adding here
  // as well would show the same rupees twice, so send the user to a transfer.
  if (goal.linkedAccount) {
    throw new HttpError(400, "This goal tracks an account", "GOAL_TRACKS_ACCOUNT");
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

export async function deleteGoal(req: Request, res: Response) {
  const uid = userId(req);
  const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");
  res.json({ ok: true });
}
