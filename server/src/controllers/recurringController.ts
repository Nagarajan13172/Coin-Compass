import type { Request, Response } from "express";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { recurringSchema, recurringUpdateSchema } from "../validators/schemas";
import { processDueRecurring } from "../services/recurringService";
import { HttpError } from "../middleware/errorHandler";

const populate = [
  { path: "account", select: "name color icon currency" },
  { path: "toAccount", select: "name color icon currency" },
  { path: "category", select: "name color icon type" },
];

export async function listRecurring(_req: Request, res: Response) {
  const items = await RecurringTransaction.find().sort({ nextRun: 1 }).populate(populate).lean();
  res.json(items);
}

export async function createRecurring(req: Request, res: Response) {
  const data = recurringSchema.parse(req.body);
  if (!data.nextRun) data.nextRun = data.startDate;
  if (data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;
  const item = await RecurringTransaction.create(data);
  res.status(201).json(await item.populate(populate));
}

export async function updateRecurring(req: Request, res: Response) {
  const data = recurringUpdateSchema.parse(req.body);
  const item = await RecurringTransaction.findByIdAndUpdate(req.params.id, data, {
    new: true,
  }).populate(populate);
  if (!item) throw new HttpError(404, "Recurring transaction not found");
  res.json(item);
}

export async function deleteRecurring(req: Request, res: Response) {
  const item = await RecurringTransaction.findByIdAndDelete(req.params.id);
  if (!item) throw new HttpError(404, "Recurring transaction not found");
  res.json({ ok: true });
}

/** Manually trigger processing of due recurring rules. */
export async function runRecurring(_req: Request, res: Response) {
  const created = await processDueRecurring();
  res.json({ created });
}
