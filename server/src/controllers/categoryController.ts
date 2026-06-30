import type { Request, Response } from "express";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { categorySchema, categoryUpdateSchema } from "../validators/schemas";
import { HttpError } from "../middleware/errorHandler";

export async function listCategories(req: Request, res: Response) {
  const filter: Record<string, unknown> = {};
  if (req.query.type) filter.type = req.query.type;
  const categories = await Category.find(filter).sort({ order: 1, name: 1 }).lean();
  res.json(categories);
}

export async function createCategory(req: Request, res: Response) {
  const data = categorySchema.parse(req.body);
  const category = await Category.create(data);
  res.status(201).json(category);
}

export async function updateCategory(req: Request, res: Response) {
  const data = categoryUpdateSchema.parse(req.body);
  const category = await Category.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!category) throw new HttpError(404, "Category not found");
  res.json(category);
}

export async function deleteCategory(req: Request, res: Response) {
  const id = req.params.id;
  const inUse = await Transaction.countDocuments({ category: id });
  if (inUse > 0 && req.query.force !== "true") {
    throw new HttpError(
      409,
      `Category is used by ${inUse} transaction(s). Pass ?force=true to clear the category on those.`
    );
  }
  if (req.query.force === "true") {
    await Transaction.updateMany({ category: id }, { $set: { category: null } });
  }
  const category = await Category.findByIdAndDelete(id);
  if (!category) throw new HttpError(404, "Category not found");
  // also detach subcategories
  await Category.updateMany({ parent: id }, { $set: { parent: null } });
  res.json({ ok: true });
}
