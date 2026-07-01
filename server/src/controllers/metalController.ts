import type { Request, Response } from "express";
import { getLatestMetals, getMetalHistory } from "../services/metalPriceService";
import type { Metal } from "../models/MetalPrice";

export async function latestMetals(_req: Request, res: Response) {
  res.json(await getLatestMetals());
}

export async function metalHistory(req: Request, res: Response) {
  const metal: Metal = req.query.metal === "silver" ? "silver" : "gold";
  const days = Math.min(Math.max(Number(req.query.days ?? 90), 1), 365);
  res.json(await getMetalHistory(metal, days));
}
