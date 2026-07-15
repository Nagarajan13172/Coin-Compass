import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { categorySchema, categoryUpdateSchema } from "../validators/schemas";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

// How far back the category picker looks to rank "frequently used" categories.
// Recent (not all-time) so the ranking tracks how spending actually shifts over
// time instead of ossifying around a category the user leaned on a year ago.
const USAGE_WINDOW_DAYS = 90;

export async function listCategories(req: Request, res: Response) {
  const uid = userId(req);
  const filter: Record<string, unknown> = { user: uid };
  if (req.query.type) filter.type = req.query.type;
  const categories = await Category.find(filter).sort({ order: 1, name: 1 }).lean();

  // Attach a recent usage count per category so the client can float the ones
  // the user actually reaches for to the top of the picker. The aggregate
  // pre-hook already excludes soft-deleted transactions.
  const since = new Date(Date.now() - USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const usage = await Transaction.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { user: new Types.ObjectId(uid), category: { $ne: null }, date: { $gte: since } } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const counts = new Map(usage.map((u) => [String(u._id), u.count]));

  res.json(categories.map((c) => ({ ...c, usageCount: counts.get(String(c._id)) ?? 0 })));
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
