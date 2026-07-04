import type { Request, Response } from "express";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { categorySchema, categoryUpdateSchema } from "../validators/schemas";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function listCategories(req: Request, res: Response) {
  const uid = userId(req);
  const filter: Record<string, unknown> = { user: uid };
  if (req.query.type) filter.type = req.query.type;
  const categories = await Category.find(filter).sort({ order: 1, name: 1 }).lean();
  res.json(categories);
}

export async function createCategory(req: Request, res: Response) {
  const uid = userId(req);
  const data = categorySchema.parse(req.body);
  const category = await Category.create({ ...data, user: uid });
  res.status(201).json(category);
}

export async function updateCategory(req: Request, res: Response) {
  const uid = userId(req);
  const data = categoryUpdateSchema.parse(req.body);
  const category = await Category.findOneAndUpdate({ _id: req.params.id, user: uid }, data, { new: true });
  if (!category) throw new HttpError(404, "Category not found");
  res.json(category);
}

export async function deleteCategory(req: Request, res: Response) {
  const uid = userId(req);
  const id = req.params.id;
  const inUse = await Transaction.countDocuments({ user: uid, category: id });
  if (inUse > 0 && req.query.force !== "true") {
    throw new HttpError(
      409,
      `Category is used by ${inUse} transaction(s). Pass ?force=true to clear the category on those.`,
      "CATEGORY_IN_USE",
      { count: inUse }
    );
  }
  if (req.query.force === "true") {
    await Transaction.updateMany({ user: uid, category: id }, { $set: { category: null } });
  }
  const category = await Category.findOneAndDelete({ _id: id, user: uid });
  if (!category) throw new HttpError(404, "Category not found");
  // also detach subcategories
  await Category.updateMany({ user: uid, parent: id }, { $set: { parent: null } });
  // Remove budgets scoped to this category — a category-scoped budget can't survive
  // its category, and leaving it would make it silently count *all* expenses.
  await Budget.deleteMany({ user: uid, category: id });
  res.json({ ok: true });
}
