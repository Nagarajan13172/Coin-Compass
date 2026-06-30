import type { Request, Response } from "express";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { computeAllBalances } from "../services/balanceService";
import { accountSchema, accountUpdateSchema } from "../validators/schemas";
import { HttpError } from "../middleware/errorHandler";

export async function listAccounts(req: Request, res: Response) {
  const includeArchived = req.query.includeArchived === "true";
  const filter = includeArchived ? {} : { archived: false };
  const accounts = await Account.find(filter).sort({ order: 1, createdAt: 1 }).lean();
  const balances = await computeAllBalances();

  const withBalances = accounts.map((a) => ({
    ...a,
    balance: balances.get(String(a._id))?.balance ?? a.initialBalance ?? 0,
    stats: balances.get(String(a._id)) ?? null,
  }));
  res.json(withBalances);
}

export async function getAccount(req: Request, res: Response) {
  const account = await Account.findById(req.params.id).lean();
  if (!account) throw new HttpError(404, "Account not found");
  const balances = await computeAllBalances();
  res.json({ ...account, balance: balances.get(String(account._id))?.balance ?? 0 });
}

export async function createAccount(req: Request, res: Response) {
  const data = accountSchema.parse(req.body);
  const account = await Account.create(data);
  res.status(201).json(account);
}

export async function updateAccount(req: Request, res: Response) {
  const data = accountUpdateSchema.parse(req.body);
  const account = await Account.findByIdAndUpdate(req.params.id, data, { new: true });
  if (!account) throw new HttpError(404, "Account not found");
  res.json(account);
}

export async function deleteAccount(req: Request, res: Response) {
  const id = req.params.id;
  const txnCount = await Transaction.countDocuments({
    $or: [{ account: id }, { toAccount: id }],
  });
  if (txnCount > 0 && req.query.force !== "true") {
    throw new HttpError(
      409,
      `Account has ${txnCount} transaction(s). Pass ?force=true to delete them too, or archive instead.`
    );
  }
  if (req.query.force === "true") {
    await Transaction.deleteMany({ $or: [{ account: id }, { toAccount: id }] });
  }
  const account = await Account.findByIdAndDelete(id);
  if (!account) throw new HttpError(404, "Account not found");
  res.json({ ok: true });
}
