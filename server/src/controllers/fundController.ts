import type { Request, Response } from "express";
import { fundBuySchema, fundRedeemSchema } from "../validators/schemas";
import {
  buyFund,
  deleteLot,
  deleteRedemption,
  getFundPortfolio,
  listRedemptions,
  redeemFund,
} from "../services/fundService";
import { refreshFundUniverse, searchFunds } from "../services/navService";
import { userId } from "../middleware/auth";
import { env } from "../config/env";
import { HttpError } from "../middleware/errorHandler";

/** Refuse every fund route when the feature is switched off, as stocks do. */
function assertEnabled() {
  if (!env.funds.enabled) {
    throw new HttpError(400, "Mutual fund tracking isn't switched on", "FUNDS_DISABLED");
  }
}

/** Type-ahead over the cached AMFI universe. */
export async function search(req: Request, res: Response) {
  assertEnabled();
  res.json(await searchFunds(String(req.query.q ?? "")));
}

export async function portfolio(req: Request, res: Response) {
  assertEnabled();
  res.json(await getFundPortfolio(userId(req)));
}

export async function buy(req: Request, res: Response) {
  assertEnabled();
  const data = fundBuySchema.parse(req.body);
  const lot = await buyFund(userId(req), {
    schemeCode: data.schemeCode,
    account: data.account,
    amount: data.amount ?? undefined,
    units: data.units ?? undefined,
    nav: data.nav ?? undefined,
    buyDate: data.buyDate ?? new Date(),
    fees: data.fees ?? 0,
    folio: data.folio ?? "",
    note: data.note ?? "",
    recordCash: data.recordCash ?? true,
  });
  res.status(201).json(lot);
}

export async function redeem(req: Request, res: Response) {
  assertEnabled();
  const data = fundRedeemSchema.parse(req.body);
  const redemption = await redeemFund(userId(req), {
    schemeCode: data.schemeCode,
    account: data.account,
    units: data.units,
    nav: data.nav ?? undefined,
    sellDate: data.sellDate ?? new Date(),
    fees: data.fees ?? 0,
    note: data.note ?? "",
  });
  res.status(201).json(redemption);
}

export async function redemptions(req: Request, res: Response) {
  assertEnabled();
  res.json(await listRedemptions(userId(req)));
}

export async function removeLot(req: Request, res: Response) {
  assertEnabled();
  await deleteLot(userId(req), req.params.id);
  res.json({ ok: true });
}

export async function removeRedemption(req: Request, res: Response) {
  assertEnabled();
  await deleteRedemption(userId(req), req.params.id);
  res.json({ ok: true });
}

/** Pull today's NAV file on demand — the same button the Stocks page has. */
export async function refresh(_req: Request, res: Response) {
  assertEnabled();
  const count = await refreshFundUniverse();
  res.json({ ok: true, schemes: count });
}
