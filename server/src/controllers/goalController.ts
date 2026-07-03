import type { Request, Response } from "express";
import { Goal } from "../models/Goal";
import { goalSchema, goalUpdateSchema, goalContributeSchema } from "../validators/schemas";
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
  const goals = await Goal.find({ user: uid }).sort({ createdAt: -1 }).lean();
  res.json(goals.map(withProgress));
}

export async function createGoal(req: Request, res: Response) {
  const uid = userId(req);
  const data = goalSchema.parse(req.body);
  const goal = await Goal.create({ ...data, user: uid });
  res.status(201).json(withProgress(goal.toObject()));
}

export async function updateGoal(req: Request, res: Response) {
  const uid = userId(req);
  const data = goalUpdateSchema.parse(req.body);
  const goal = await Goal.findOne({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");

  Object.assign(goal, data);
  // Editing savedAmount/targetAmount can cross the finish line just like a
  // contribution does — keep achievedAt in step so the persisted date isn't stale.
  if (goal.targetAmount > 0 && goal.savedAmount >= goal.targetAmount) {
    if (!goal.achievedAt) goal.achievedAt = new Date();
  } else {
    goal.achievedAt = null;
  }
  await goal.save();
  res.json(withProgress(goal.toObject()));
}

/** Add (or subtract, if negative) an amount to the goal's saved total. */
export async function contributeGoal(req: Request, res: Response) {
  const uid = userId(req);
  const { amount } = goalContributeSchema.parse(req.body);
  const goal = await Goal.findOne({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");

  goal.savedAmount = Math.max(0, (goal.savedAmount ?? 0) + amount);
  if (goal.targetAmount > 0 && goal.savedAmount >= goal.targetAmount) {
    if (!goal.achievedAt) goal.achievedAt = new Date();
  } else {
    goal.achievedAt = null; // dropped back below target
  }
  await goal.save();
  res.json(withProgress(goal.toObject()));
}

export async function deleteGoal(req: Request, res: Response) {
  const uid = userId(req);
  const goal = await Goal.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!goal) throw new HttpError(404, "Goal not found");
  res.json({ ok: true });
}
