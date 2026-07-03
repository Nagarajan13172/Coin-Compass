import type { Request, Response } from "express";
import { exportTransactionsCsv } from "../services/csvService";
import { Settings } from "../models/Settings";
import { userId } from "../middleware/auth";

export async function exportCsv(req: Request, res: Response) {
  const uid = userId(req);
  const start = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  // `to` is an inclusive day → end at the start of the next day so the final day's
  // transactions aren't silently excluded from the export.
  const end = req.query.to
    ? new Date(new Date(String(req.query.to)).getTime() + 86400000)
    : new Date(Date.now() + 86400000);
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
