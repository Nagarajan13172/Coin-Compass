import type { Request, Response } from "express";
import { Budget } from "../models/Budget";
import { budgetSchema, budgetUpdateSchema } from "../validators/schemas";
import { getSpentForCategory } from "../services/reportService";
import { resolvePeriod, type Period } from "../utils/dateRange";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const periodMap: Record<string, Period> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

async function withProgress(
  uid: string,
  budget: {
    _id: unknown;
    category: unknown;
    amount: number;
    period: string;
    [k: string]: unknown;
  }
) {
  const { start, end } = resolvePeriod(periodMap[budget.period] ?? "month");
  const spent = await getSpentForCategory(uid, budget.category ? String(budget.category) : null, start, end);
  const remaining = budget.amount - spent;
  const percent = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
  return {
    ...budget,
    spent,
    remaining,
    percent,
    over: spent > budget.amount,
    periodRange: { start, end },
  };
}

export async function listBudgets(req: Request, res: Response) {
  const uid = userId(req);
  const budgets = await Budget.find({ user: uid }).populate("category", "name color icon type").lean();
  const result = await Promise.all(budgets.map((b) => withProgress(uid, b as never)));
  res.json(result);
}

export async function createBudget(req: Request, res: Response) {
  const uid = userId(req);
  const data = budgetSchema.parse(req.body);
  const budget = await Budget.create({ ...data, user: uid });
  const populated = await budget.populate("category", "name color icon type");
  res.status(201).json(await withProgress(uid, populated.toObject() as never));
}

export async function updateBudget(req: Request, res: Response) {
  const uid = userId(req);
  const data = budgetUpdateSchema.parse(req.body);
  const budget = await Budget.findOneAndUpdate({ _id: req.params.id, user: uid }, data, {
    new: true,
  }).populate("category", "name color icon type");
  if (!budget) throw new HttpError(404, "Budget not found");
  res.json(await withProgress(uid, budget.toObject() as never));
}

export async function deleteBudget(req: Request, res: Response) {
  const uid = userId(req);
  const budget = await Budget.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!budget) throw new HttpError(404, "Budget not found");
  res.json({ ok: true });
}
