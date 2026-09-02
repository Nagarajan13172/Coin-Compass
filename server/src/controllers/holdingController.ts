import type { Request, Response } from "express";
import { Holding } from "../models/Holding";
import { Transaction } from "../models/Transaction";
import {
  holdingSchema,
  holdingUpdateSchema,
  holdingDepositSchema,
  holdingWithdrawSchema,
  holdingAdoptSchema,
} from "../validators/schemas";
import {
  adoptTransactions,
  depositCandidates,
  depositToHolding,
  withdrawFromHolding,
} from "../services/depositService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function listHoldings(req: Request, res: Response) {
  const uid = userId(req);
  const holdings = await Holding.find({ user: uid }).sort({ value: -1 }).lean();
  res.json(holdings);
}

export async function createHolding(req: Request, res: Response) {
  const uid = userId(req);
  const data = holdingSchema.parse(req.body);
  const holding = await Holding.create({ ...data, user: uid });
  res.status(201).json(holding.toObject());
}

export async function updateHolding(req: Request, res: Response) {
  const uid = userId(req);
  const data = holdingUpdateSchema.parse(req.body);
  const holding = await Holding.findOneAndUpdate({ _id: req.params.id, user: uid }, data, { new: true });
  if (!holding) throw new HttpError(404, "Holding not found");
  res.json(holding.toObject());
}

export async function deleteHolding(req: Request, res: Response) {
  const uid = userId(req);
  const holding = await Holding.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!holding) throw new HttpError(404, "Holding not found");
  // The ledger legs that fed it stay: the money really did move out of the bank
  // on those days, and rewriting history to hide that would be a lie. They simply
  // stop naming a holding, so an edit or delete no longer tries to reverse onto
  // a document that is gone.
  await Transaction.updateMany({ user: uid, holding: holding._id }, { $set: { holding: null, holdingContribution: 0 } });
  res.json({ ok: true });
}

/** Pay into a deposit — the RD instalment. A transfer, never a spend. */
export async function depositHolding(req: Request, res: Response) {
  const uid = userId(req);
  const data = holdingDepositSchema.parse(req.body);
  const result = await depositToHolding(uid, { ...data, holding: req.params.id });
  res.status(201).json(result);
}

/** Take money out — a maturity payout or a partial withdrawal. */
export async function withdrawHolding(req: Request, res: Response) {
  const uid = userId(req);
  const data = holdingWithdrawSchema.parse(req.body);
  res.json(await withdrawFromHolding(uid, { ...data, holding: req.params.id }));
}

/** Past expenses that look like payments into this deposit. */
export async function holdingCandidates(req: Request, res: Response) {
  res.json(await depositCandidates(userId(req), req.params.id));
}

/** Rewrite those past expenses as payments into this deposit. */
export async function adoptHoldingTransactions(req: Request, res: Response) {
  const uid = userId(req);
  const { transactions } = holdingAdoptSchema.parse(req.body);
  res.json(await adoptTransactions(uid, req.params.id, transactions));
}
