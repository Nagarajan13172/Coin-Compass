import type { Request, Response } from "express";
import {
  getSummary,
  getByCategory,
  getTrend,
  getByAccount,
} from "../services/reportService";
import { resolvePeriod, type Period } from "../utils/dateRange";

/** Resolve a date range from query params: either ?period=month or ?from&to. */
function rangeFromQuery(query: Request["query"]) {
  if (query.from || query.to) {
    return {
      start: query.from ? new Date(String(query.from)) : new Date(0),
      end: query.to ? new Date(String(query.to)) : new Date(),
    };
  }
  const period = (String(query.period ?? "month") as Period) || "month";
  return resolvePeriod(period);
}

export async function summaryReport(req: Request, res: Response) {
  res.json(await getSummary(rangeFromQuery(req.query)));
}

export async function byCategoryReport(req: Request, res: Response) {
  const { start, end } = rangeFromQuery(req.query);
  const type = (req.query.type === "income" ? "income" : "expense") as "income" | "expense";
  res.json(await getByCategory({ start, end, type }));
}

export async function trendReport(req: Request, res: Response) {
  const { start, end } = rangeFromQuery(req.query);
  const granularity = ["day", "week", "month"].includes(String(req.query.granularity))
    ? (req.query.granularity as "day" | "week" | "month")
    : "day";
  res.json(await getTrend({ start, end, granularity }));
}

export async function byAccountReport(req: Request, res: Response) {
  res.json(await getByAccount(rangeFromQuery(req.query)));
}
