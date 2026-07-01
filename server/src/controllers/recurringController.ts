import type { Request, Response } from "express";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { Transaction } from "../models/Transaction";
import { recurringSchema, recurringUpdateSchema } from "../validators/schemas";
import {
  processDueRecurring,
  previewOccurrences,
  nextRunFrom,
  runRule,
  skipNextOccurrence,
} from "../services/recurringService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const populate = [
  { path: "account", select: "name color icon currency" },
  { path: "toAccount", select: "name color icon currency" },
  { path: "category", select: "name color icon type" },
];

/** Attach the next few scheduled run dates so the client can preview upcoming occurrences. */
function withUpcoming(item: Record<string, unknown>) {
  return {
    ...item,
    upcoming: previewOccurrences(
      item as { frequency: string; interval: number; nextRun: Date; endDate: Date | null },
      5
    ),
  };
}

export async function listRecurring(req: Request, res: Response) {
  const items = await RecurringTransaction.find({ user: userId(req) })
    .sort({ nextRun: 1 })
    .populate(populate)
    .lean();
  res.json(items.map(withUpcoming));
}

export async function createRecurring(req: Request, res: Response) {
  const data = recurringSchema.parse(req.body);
  if (!data.nextRun) data.nextRun = data.startDate;
  if (data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;
  const item = await RecurringTransaction.create({ ...data, user: userId(req) });
  await item.populate(populate);
  res.status(201).json(withUpcoming(item.toObject()));
}

export async function updateRecurring(req: Request, res: Response) {
  const data = recurringUpdateSchema.parse(req.body);
  const item = await RecurringTransaction.findOne({ _id: req.params.id, user: userId(req) });
  if (!item) throw new HttpError(404, "Recurring transaction not found");

  if (data.type && data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;

  // Re-anchor the schedule only when the start date actually changes, and never
  // back-post a burst: a past start rolls forward to the first future occurrence.
  if (data.startDate && +new Date(data.startDate) !== +item.startDate) {
    const frequency = data.frequency ?? item.frequency;
    const interval = data.interval ?? item.interval;
    const now = new Date();
    const start = new Date(data.startDate);
    data.nextRun = start > now ? start : nextRunFrom(start, frequency, interval, now);
    // If re-anchoring pushed nextRun past the end date, the rule is finished — deactivate
    // it now rather than leaving it active-but-dead until a future cron pass.
    const effectiveEnd = data.endDate !== undefined ? data.endDate : item.endDate;
    if (effectiveEnd && data.nextRun > effectiveEnd) data.active = false;
  } else {
    // Editing amount/category/note etc. must not disturb the schedule position.
    delete data.nextRun;
  }

  Object.assign(item, data);
  await item.save();
  await item.populate(populate);
  res.json(withUpcoming(item.toObject()));
}

export async function deleteRecurring(req: Request, res: Response) {
  const item = await RecurringTransaction.findOneAndDelete({ _id: req.params.id, user: userId(req) });
  if (!item) throw new HttpError(404, "Recurring transaction not found");
  res.json({ ok: true });
}

/** Manually trigger processing of the caller's due recurring rules. */
export async function runRecurring(req: Request, res: Response) {
  const created = await processDueRecurring(new Date(), userId(req));
  res.json({ created });
}

/** Post the due occurrences for a single rule. */
export async function runRecurringOne(req: Request, res: Response) {
  const created = await runRule(req.params.id, userId(req));
  if (created === null) throw new HttpError(404, "Recurring transaction not found");
  res.json({ created });
}

/** Skip the next scheduled occurrence without posting a transaction. */
export async function skipRecurring(req: Request, res: Response) {
  const item = await skipNextOccurrence(req.params.id, userId(req));
  if (!item) throw new HttpError(404, "Recurring transaction not found");
  await (item as unknown as { populate: (p: unknown) => Promise<unknown> }).populate(populate);
  res.json(withUpcoming((item as unknown as { toObject: () => Record<string, unknown> }).toObject()));
}

/** List the transactions that a rule has already posted (its history). */
export async function listRecurringTransactions(req: Request, res: Response) {
  const items = await Transaction.find({ recurring: req.params.id, user: userId(req) })
    .sort({ date: -1, createdAt: -1 })
    .populate("account", "name color icon currency")
    .populate("toAccount", "name color icon currency")
    .populate("category", "name color icon type")
    .lean();
  res.json(items);
}
