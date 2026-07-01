import type { Request, Response } from "express";
import { exportTransactionsCsv } from "../services/csvService";
import { Settings } from "../models/Settings";
import { userId } from "../middleware/auth";

export async function exportCsv(req: Request, res: Response) {
  const uid = userId(req);
  const start = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const end = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 86400000);
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
