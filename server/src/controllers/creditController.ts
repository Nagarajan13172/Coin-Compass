import type { Request, Response } from "express";
import { creditSchema, creditUpdateSchema } from "../validators/schemas";
import { createCredit, updateCredit, deleteCredit, listCredits, getCreditSummary } from "../services/creditService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const POPULATE = { path: "account", select: "name color icon currency" };

export async function listCreditsHandler(req: Request, res: Response) {
  const person = typeof req.query.person === "string" ? req.query.person : undefined;
  res.json(await listCredits(userId(req), person));
}

export async function creditSummary(req: Request, res: Response) {
  res.json(await getCreditSummary(userId(req)));
}

export async function createCreditHandler(req: Request, res: Response) {
  const uid = userId(req);
  const data = creditSchema.parse(req.body);
  const credit = await createCredit(uid, data);
  const populated = await credit.populate(POPULATE);
  res.status(201).json(populated);
}

export async function updateCreditHandler(req: Request, res: Response) {
  const uid = userId(req);
  const data = creditUpdateSchema.parse(req.body);
  const credit = await updateCredit(uid, req.params.id, data);
  if (!credit) throw new HttpError(404, "Credit entry not found");
  const populated = await credit.populate(POPULATE);
  res.json(populated);
}

export async function deleteCreditHandler(req: Request, res: Response) {
  const ok = await deleteCredit(userId(req), req.params.id);
  if (!ok) throw new HttpError(404, "Credit entry not found");
  res.json({ ok: true });
}
