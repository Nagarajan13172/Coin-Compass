import type { Request, Response } from "express";
import { Transaction } from "../models/Transaction";
import { transactionSchema, transactionUpdateSchema } from "../validators/schemas";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

function buildFilter(query: Request["query"]): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.account) filter.account = query.account;
  if (query.category) filter.category = query.category;
  if (query.type) filter.type = query.type;
  if (query.tag) filter.tags = query.tag;

  if (query.from || query.to) {
    const date: Record<string, Date> = {};
    if (query.from) date.$gte = new Date(String(query.from));
    if (query.to) date.$lt = new Date(String(query.to));
    filter.date = date;
  }

  if (query.search) {
    const rx = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ note: rx }, { payee: rx }, { tags: rx }];
  }
  return filter;
}

export async function listTransactions(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
  const filter = { ...buildFilter(req.query), user: userId(req) };

  const [items, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("account", "name color icon currency")
      .populate("toAccount", "name color icon currency")
      .populate("category", "name color icon type")
      .lean(),
    Transaction.countDocuments(filter),
  ]);

  res.json({
    items,
    page,
    limit,
    total,
    pages: Math.ceil(total / limit),
    hasMore: page * limit < total,
  });
}

export async function getTransaction(req: Request, res: Response) {
  const txn = await Transaction.findOne({ _id: req.params.id, user: userId(req) })
    .populate("account", "name color icon currency")
    .populate("toAccount", "name color icon currency")
    .populate("category", "name color icon type")
    .lean();
  if (!txn) throw new HttpError(404, "Transaction not found");
  res.json(txn);
}

export async function createTransaction(req: Request, res: Response) {
  const data = transactionSchema.parse(req.body);
  if (data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;
  const txn = await Transaction.create({ ...data, user: userId(req) });
  const populated = await txn.populate([
    { path: "account", select: "name color icon currency" },
    { path: "toAccount", select: "name color icon currency" },
    { path: "category", select: "name color icon type" },
  ]);
  res.status(201).json(populated);
}

export async function updateTransaction(req: Request, res: Response) {
  const data = transactionUpdateSchema.parse(req.body);
  if (data.type && data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;
  const txn = await Transaction.findOneAndUpdate({ _id: req.params.id, user: userId(req) }, data, {
    new: true,
  }).populate([
    { path: "account", select: "name color icon currency" },
    { path: "toAccount", select: "name color icon currency" },
    { path: "category", select: "name color icon type" },
  ]);
  if (!txn) throw new HttpError(404, "Transaction not found");
  res.json(txn);
}

export async function deleteTransaction(req: Request, res: Response) {
  const txn = await Transaction.findOneAndDelete({ _id: req.params.id, user: userId(req) });
  if (!txn) throw new HttpError(404, "Transaction not found");
  res.json({ ok: true });
}
