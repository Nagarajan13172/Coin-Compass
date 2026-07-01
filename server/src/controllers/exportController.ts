import type { Request, Response } from "express";
import { exportTransactionsCsv } from "../services/csvService";
import { userId } from "../middleware/auth";

export async function exportCsv(req: Request, res: Response) {
  const start = req.query.from ? new Date(String(req.query.from)) : new Date(0);
  const end = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 86400000);
  const csv = await exportTransactionsCsv(userId(req), start, end);
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="transactions-${stamp}.csv"`);
  res.send(csv);
}
