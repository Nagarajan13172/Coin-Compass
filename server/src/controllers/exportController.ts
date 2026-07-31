import type { Request, Response } from "express";
import { exportTransactionsCsv } from "../services/csvService";
import { Settings } from "../models/Settings";
import { userId } from "../middleware/auth";
import { exclusiveEnd } from "../utils/dateRange";

export async function exportCsv(req: Request, res: Response) {
  const uid = userId(req);
  const start = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  // ExportMenu already converts the picker's inclusive day into an exclusive ISO
  // instant, so `to` arrives ready to use — this previously added a second day on
  // top, silently pulling an extra day into every export. exclusiveEnd only
  // extends a bare "YYYY-MM-DD". Shared with the report endpoints.
  const end = req.query.to ? exclusiveEnd(String(req.query.to)) : new Date(Date.now() + 86_400_000);
  const settings = await Settings.findOne({ user: uid }).select("baseCurrency").lean();
  const currency = (settings?.baseCurrency ?? "INR").toUpperCase();
  const csv = await exportTransactionsCsv(uid, start, end);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="coincompass-transactions-${stamp}-${currency}.csv"`
  );
  res.send(csv);
}
