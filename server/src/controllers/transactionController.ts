import type { Request, Response } from "express";
import { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { transactionSchema, transactionUpdateSchema } from "../validators/schemas";
import { balanceAsOf } from "../services/balanceService";
import { applyLoanPayment, reverseLoanPayment } from "../services/loanService";
import { unlinkCreditTransaction, syncCreditFromTransaction, deleteCreditForTransaction } from "../services/creditService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const POPULATE = [
  { path: "account", select: "name color icon currency" },
  { path: "toAccount", select: "name color icon currency" },
  { path: "category", select: "name color icon type" },
  { path: "loan", select: "name" },
  { path: "credit", select: "person direction" },
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
  // A single tag matches array membership; a comma-separated list becomes $in (any of).
  if (query.tag) filter.tags = oneOrMany(query.tag);

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

/**
 * Grand-total balance across all accounts as of an instant (`?asOf=<ISO>`,
 * exclusive), or right now when omitted. The Transactions page uses this to
 * anchor the per-day "end-of-day balance": for the current/all-time view the
 * present total works, but for a past month it needs the total as it stood at
 * the end of that month — which this returns.
 */
export async function ledgerBalance(req: Request, res: Response) {
  const asOfRaw = req.query.asOf ? new Date(String(req.query.asOf)) : undefined;
  const asOf = asOfRaw && !Number.isNaN(asOfRaw.getTime()) ? asOfRaw : undefined;
  const balance = await balanceAsOf(userId(req), asOf);
  res.json({ balance });
}

/** Distinct tags the user has applied across their transactions, with usage counts
 *  (most-used first) — powers the Transactions page tag filter. */
export async function listTags(req: Request, res: Response) {
  const rows = await Transaction.aggregate<{ _id: string; count: number }>([
    { $match: { user: new Types.ObjectId(userId(req)) } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  res.json(rows.map((r) => ({ tag: r._id, count: r.count })));
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
  const prevCredit = txn.credit;
  Object.assign(txn, data);

  // Guard the transfer invariants on the *effective* transaction — the update
  // schema can't, since a PATCH may change only one side (e.g. flip type to
  // transfer while keeping the existing account). Without this, an edit can create
  // a same-account or destination-less transfer that leaks money.
  if (txn.type === "transfer") {
    if (!txn.toAccount) throw new HttpError(400, "Transfers require a destination account");
    if (String(txn.account) === String(txn.toAccount)) {
      throw new HttpError(400, "Source and destination accounts must differ");
    }
  }

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

  // Keep a linked credit entry in sync, or unlink it (keeping the credit itself)
  // if this transaction no longer represents a person-to-person movement.
  if (prevCredit) {
    if (txn.type === "transfer") {
      txn.credit = null;
      await unlinkCreditTransaction(uid, prevCredit);
    } else {
      await syncCreditFromTransaction(uid, prevCredit, {
        amount: txn.amount,
        date: txn.date,
        account: txn.account,
        direction: txn.type === "expense" ? "given" : "received",
      });
    }
  }
  await txn.save();

  const populated = await txn.populate(POPULATE);
  res.json(populated);
}

export async function deleteTransaction(req: Request, res: Response) {
  const uid = userId(req);
  const txn = await Transaction.findOne({ _id: req.params.id, user: uid });
  if (!txn) throw new HttpError(404, "Transaction not found");

  // Loan/credit-linked transactions carry stored side effects (a loan's outstanding,
  // a paired Credit entry) that can't be cleanly reconstructed on restore — so they're
  // still removed permanently, reversing those effects exactly as before.
  if (txn.loan || txn.credit) {
    await Transaction.deleteOne({ _id: txn._id });
    if (txn.loan) await reverseLoanPayment(txn.loan, uid, txn.loanPrincipal ?? txn.amount, txn.loanInterest ?? 0);
    if (txn.credit) await deleteCreditForTransaction(uid, txn.credit);
    return res.json({ ok: true, recoverable: false });
  }

  // Everything else is side-effect-free (balances are derived from transactions), so
  // a soft delete is enough: hidden everywhere, restorable, purged after the window.
  txn.deletedAt = new Date();
  await txn.save();
  res.json({ ok: true, recoverable: true, id: String(txn._id) });
}

/** List the user's soft-deleted transactions (the "Recently deleted" trash), newest first. */
export async function listDeletedTransactions(req: Request, res: Response) {
  const items = await Transaction.find({ user: userId(req), deletedAt: { $ne: null } })
    .setOptions({ withDeleted: true })
    .sort({ deletedAt: -1 })
    .limit(200)
    .populate(POPULATE)
    .lean();
  res.json(items);
}

/** Restore a soft-deleted transaction back into the ledger. */
export async function restoreTransaction(req: Request, res: Response) {
  const txn = await Transaction.findOne({ _id: req.params.id, user: userId(req), deletedAt: { $ne: null } })
    .setOptions({ withDeleted: true });
  if (!txn) throw new HttpError(404, "Deleted transaction not found");
  txn.deletedAt = null;
  await txn.save();
  const populated = await txn.populate(POPULATE);
  res.json(populated);
}
