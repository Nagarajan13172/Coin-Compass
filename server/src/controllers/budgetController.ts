import type { Request, Response } from "express";
import { Budget } from "../models/Budget";
import { budgetSchema, budgetUpdateSchema } from "../validators/schemas";
import { getSpentForCategory } from "../services/reportService";
import { resolvePeriod, type Period } from "../utils/dateRange";
import { HttpError } from "../middleware/errorHandler";

const periodMap: Record<string, Period> = {
  weekly: "week",
  monthly: "month",
  yearly: "year",
};

async function withProgress(budget: {
  _id: unknown;
  category: unknown;
  amount: number;
  period: string;
  [k: string]: unknown;
}) {
  const { start, end } = resolvePeriod(periodMap[budget.period] ?? "month");
  const spent = await getSpentForCategory(
    budget.category ? String(budget.category) : null,
    start,
    end
  );
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

export async function listBudgets(_req: Request, res: Response) {
  const budgets = await Budget.find().populate("category", "name color icon type").lean();
  const result = await Promise.all(budgets.map((b) => withProgress(b as never)));
  res.json(result);
}

export async function createBudget(req: Request, res: Response) {
  const data = budgetSchema.parse(req.body);
  const budget = await Budget.create(data);
  const populated = await budget.populate("category", "name color icon type");
  res.status(201).json(await withProgress(populated.toObject() as never));
}

export async function updateBudget(req: Request, res: Response) {
  const data = budgetUpdateSchema.parse(req.body);
  const budget = await Budget.findByIdAndUpdate(req.params.id, data, { new: true }).populate(
    "category",
    "name color icon type"
  );
  if (!budget) throw new HttpError(404, "Budget not found");
  res.json(await withProgress(budget.toObject() as never));
}

export async function deleteBudget(req: Request, res: Response) {
  const budget = await Budget.findByIdAndDelete(req.params.id);
  if (!budget) throw new HttpError(404, "Budget not found");
  res.json({ ok: true });
}
