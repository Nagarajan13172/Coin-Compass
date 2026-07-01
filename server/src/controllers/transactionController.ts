import type { Request, Response } from "express";
import { Transaction } from "../models/Transaction";
import { transactionSchema, transactionUpdateSchema } from "../validators/schemas";
import { applyLoanPayment, reverseLoanPayment } from "../services/loanService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const POPULATE = [
  { path: "account", select: "name color icon currency" },
  { path: "toAccount", select: "name color icon currency" },
  { path: "category", select: "name color icon type" },
  { path: "loan", select: "name" },
];

/** Accept a single value or a comma-separated list ("a,b" → { $in: ["a","b"] }). */
function oneOrMany(value: unknown): unknown {
  const parts = String(value)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? { $in: parts } : parts[0];
}

function buildFilter(query: Request["query"]): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.account) filter.account = oneOrMany(query.account);
  if (query.category) filter.category = query.category;
  if (query.type) filter.type = oneOrMany(query.type);
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
      .populate(POPULATE)
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
    .populate(POPULATE)
    .lean();
  if (!txn) throw new HttpError(404, "Transaction not found");
  res.json(txn);
}

export async function createTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const data = transactionSchema.parse(req.body);
  if (data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;
  const txn = await Transaction.create({ ...data, user: uid });
  // Linked to a loan → principal reduces the balance, interest is tracked separately.
  if (txn.loan) {
    const { principal, interest } = await applyLoanPayment(txn.loan, uid, txn.amount);
    txn.loanPrincipal = principal;
    txn.loanInterest = interest;
    await txn.save();
  }
  const populated = await txn.populate(POPULATE);
  res.status(201).json(populated);
}

export async function updateTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const data = transactionUpdateSchema.parse(req.body);
  if (data.type && data.type !== "transfer") data.toAccount = null;
  if (data.type === "transfer") data.category = null;

  const txn = await Transaction.findOne({ _id: req.params.id, user: uid });
  if (!txn) throw new HttpError(404, "Transaction not found");

  const prevLoan = txn.loan;
  const prevPrincipal = txn.loanPrincipal ?? 0;
  const prevInterest = txn.loanInterest ?? 0;
  Object.assign(txn, data);

  // Reconcile: undo the previous payment (principal + interest), then apply the new
  // one fresh (recomputing on the restored balance). Handles amount changes,
  // re-linking to a different loan, or clearing the link.
  if (prevLoan) await reverseLoanPayment(prevLoan, uid, prevPrincipal, prevInterest);
  if (txn.loan) {
    const { principal, interest } = await applyLoanPayment(txn.loan, uid, txn.amount);
    txn.loanPrincipal = principal;
    txn.loanInterest = interest;
  } else {
    txn.loanPrincipal = 0;
    txn.loanInterest = 0;
  }
  await txn.save();

  const populated = await txn.populate(POPULATE);
  res.json(populated);
}

export async function deleteTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const txn = await Transaction.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!txn) throw new HttpError(404, "Transaction not found");
  // Deleting a loan payment restores exactly the principal + interest it applied
  // (older transactions predate these fields → fall back to the full amount).
  if (txn.loan) await reverseLoanPayment(txn.loan, uid, txn.loanPrincipal ?? txn.amount, txn.loanInterest ?? 0);
  res.json({ ok: true });
}
