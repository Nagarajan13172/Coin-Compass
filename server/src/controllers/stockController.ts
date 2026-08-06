import type { Request, Response } from "express";
import { env } from "../config/env";
import { userId } from "../middleware/auth";
import { stockBuySchema, stockSellSchema } from "../validators/schemas";
import {
  applySplit,
  buyStock,
  deleteLot,
  deleteSale,
  getPortfolio,
  listSales,
  pendingSplits,
  sellStock,
} from "../services/stockService";
import {
  getStockHistory,
  refreshStockPricesOnDemand,
  searchInstruments,
} from "../services/stockPriceService";

/** The user's portfolio, valued at the newest stored prices. */
export async function portfolio(req: Request, res: Response) {
  const uid = userId(req);
  if (!env.stocks.enabled) {
    res.json({
      configured: false,
      positions: [],
      totals: {
        marketValue: 0, investedCost: 0, unrealized: 0, unrealizedPct: 0,
        dayChange: 0, realizedPL: 0, realizedShortTerm: 0, realizedLongTerm: 0,
      },
      pricedAt: null,
      anyStale: false,
    });
    return;
  }
  res.json(await getPortfolio(uid));
}

/** Symbol autocomplete. The only route by which a symbol enters the app. */
export async function search(req: Request, res: Response) {
  const q = String(req.query.q ?? "");
  res.json(await searchInstruments(q));
}

export async function buy(req: Request, res: Response) {
  const uid = userId(req);
  const data = stockBuySchema.parse(req.body);
  res.status(201).json(await buyStock(uid, data));
}

export async function sell(req: Request, res: Response) {
  const uid = userId(req);
  const data = stockSellSchema.parse(req.body);
  res.status(201).json(await sellStock(uid, data));
}

export async function removeLot(req: Request, res: Response) {
  res.json(await deleteLot(userId(req), req.params.id));
}

export async function removeSale(req: Request, res: Response) {
  res.json(await deleteSale(userId(req), req.params.id));
}

/** Realized-gain history, newest first. */
export async function sales(req: Request, res: Response) {
  res.json(await listSales(userId(req)));
}

/** Splits that have happened since purchase and aren't reflected in the lots yet. */
export async function splits(req: Request, res: Response) {
  if (!env.stocks.enabled) return void res.json([]);
  res.json(await pendingSplits(userId(req)));
}

/** Apply one split, after the user has confirmed it. Never happens automatically. */
export async function applySplitHandler(req: Request, res: Response) {
  const symbol = String(req.body?.symbol ?? "");
  const date = String(req.body?.date ?? "");
  res.json(await applySplit(userId(req), symbol, date));
}

/** Daily closes for one symbol, for the position sparkline. */
export async function history(req: Request, res: Response) {
  const symbol = String(req.query.symbol ?? "");
  const days = Math.min(Math.max(Number(req.query.days ?? 90), 1), 365);
  res.json(await getStockHistory(symbol, days));
}

/** User-triggered price refresh (rate-limited); returns the revalued portfolio. */
export async function refresh(req: Request, res: Response) {
  const uid = userId(req);
  await refreshStockPricesOnDemand();
  res.json(await getPortfolio(uid));
}
