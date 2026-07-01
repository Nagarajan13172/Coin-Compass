import type { Request, Response } from "express";
import { getNetWorthHistory } from "../services/networthService";
import { userId } from "../middleware/auth";

/** Daily net-worth snapshots, oldest → newest. Captures today's point on read. */
export async function netWorthHistory(req: Request, res: Response) {
  const days = Math.min(Math.max(Number(req.query.days ?? 365), 1), 730);
  res.json(await getNetWorthHistory(userId(req), days));
}
