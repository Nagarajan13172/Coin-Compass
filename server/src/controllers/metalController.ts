import type { Request, Response } from "express";
import { getLatestMetals, getMetalHistory, refreshMetalPricesOnDemand } from "../services/metalPriceService";
import type { Metal } from "../models/MetalPrice";

export async function latestMetals(_req: Request, res: Response) {
  res.json(await getLatestMetals());
}

export async function metalHistory(req: Request, res: Response) {
  const metal: Metal = req.query.metal === "silver" ? "silver" : "gold";
  const days = Math.min(Math.max(Number(req.query.days ?? 90), 1), 365);
  res.json(await getMetalHistory(metal, days));
}

/** User-triggered refresh (rate-limited); returns the freshly refetched snapshot. */
export async function refreshMetals(_req: Request, res: Response) {
  await refreshMetalPricesOnDemand();
  res.json(await getLatestMetals());
}
