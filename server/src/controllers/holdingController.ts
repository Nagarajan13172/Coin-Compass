import type { Request, Response } from "express";
import { Holding } from "../models/Holding";
import { holdingSchema, holdingUpdateSchema } from "../validators/schemas";
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
  res.json({ ok: true });
}
