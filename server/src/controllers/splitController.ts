import type { Request, Response } from "express";
import { splitSchema } from "../validators/schemas";
import { createSplit, updateSplit, deleteSplit, listSplits, getSplit } from "../services/splitService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function listSplitsHandler(req: Request, res: Response) {
  res.json(await listSplits(userId(req)));
}

export async function getSplitHandler(req: Request, res: Response) {
  const split = await getSplit(userId(req), req.params.id);
  if (!split) throw new HttpError(404, "Split not found");
  res.json(split);
}

export async function createSplitHandler(req: Request, res: Response) {
  const data = splitSchema.parse(req.body);
  const split = await createSplit(userId(req), data);
  res.status(201).json(await getSplit(userId(req), split._id));
}

export async function updateSplitHandler(req: Request, res: Response) {
  const uid = userId(req);
  const data = splitSchema.parse(req.body);
  const split = await updateSplit(uid, req.params.id, data);
  if (!split) throw new HttpError(404, "Split not found");
  res.json(await getSplit(uid, split._id));
}

export async function deleteSplitHandler(req: Request, res: Response) {
  const ok = await deleteSplit(userId(req), req.params.id);
  if (!ok) throw new HttpError(404, "Split not found");
  res.json({ ok: true });
}
