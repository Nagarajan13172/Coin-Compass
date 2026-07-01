import type { Request, Response } from "express";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { computeAllBalances } from "../services/balanceService";
import { accountSchema, accountUpdateSchema } from "../validators/schemas";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function listAccounts(req: Request, res: Response) {
  const uid = userId(req);
  const includeArchived = req.query.includeArchived === "true";
  const filter = includeArchived ? { user: uid } : { user: uid, archived: false };
  const accounts = await Account.find(filter).sort({ order: 1, createdAt: 1 }).lean();
  const balances = await computeAllBalances(uid);

  const withBalances = accounts.map((a) => ({
    ...a,
    balance: balances.get(String(a._id))?.balance ?? a.initialBalance ?? 0,
    stats: balances.get(String(a._id)) ?? null,
  }));
  res.json(withBalances);
}

export async function getAccount(req: Request, res: Response) {
  const uid = userId(req);
  const account = await Account.findOne({ _id: req.params.id, user: uid }).lean();
  if (!account) throw new HttpError(404, "Account not found");
  const balances = await computeAllBalances(uid);
  const stats = balances.get(String(account._id)) ?? null;
  res.json({ ...account, balance: stats?.balance ?? account.initialBalance ?? 0, stats });
}

export async function createAccount(req: Request, res: Response) {
  const uid = userId(req);
  const data = accountSchema.parse(req.body);
  const account = await Account.create({ ...data, user: uid });
  res.status(201).json(account);
}

export async function updateAccount(req: Request, res: Response) {
  const uid = userId(req);
  const data = accountUpdateSchema.parse(req.body);
  const account = await Account.findOneAndUpdate({ _id: req.params.id, user: uid }, data, { new: true });
  if (!account) throw new HttpError(404, "Account not found");
  res.json(account);
}

export async function deleteAccount(req: Request, res: Response) {
  const uid = userId(req);
  const id = req.params.id;
  const ownership = { user: uid, $or: [{ account: id }, { toAccount: id }] };
  const txnCount = await Transaction.countDocuments(ownership);
  if (txnCount > 0 && req.query.force !== "true") {
    throw new HttpError(
      409,
      `Account has ${txnCount} transaction(s). Pass ?force=true to delete them too, or archive instead.`
    );
  }
  if (req.query.force === "true") {
    await Transaction.deleteMany(ownership);
  }
  const account = await Account.findOneAndDelete({ _id: id, user: uid });
  if (!account) throw new HttpError(404, "Account not found");
  res.json({ ok: true });
}
