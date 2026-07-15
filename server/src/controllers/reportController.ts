import type { Request, Response } from "express";
import {
  getSummary,
  getByCategory,
  getTrend,
  getByAccount,
} from "../services/reportService";
import { computeInsights } from "../services/insightsService";
import { sendReportTo, type ReportKind } from "../services/reportEmailService";
import { User } from "../models/User";
import { resolvePeriod, type Period } from "../utils/dateRange";
import { userId, canSeeWealth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/** Resolve a date range from query params: either ?period=month or ?from&to. */
function rangeFromQuery(query: Request["query"]) {
  if (query.from || query.to) {
    return {
      start: query.from ? new Date(String(query.from)) : new Date(0),
      // Ranges are [start, end); `to` names an inclusive day, so end is the start
      // of the NEXT day — otherwise every transaction dated on `to` is dropped.
      end: query.to ? new Date(new Date(String(query.to)).getTime() + 86_400_000) : new Date(),
    };
  }
  const period = (String(query.period ?? "month") as Period) || "month";
  return resolvePeriod(period);
}

export async function summaryReport(req: Request, res: Response) {
  const summary = await getSummary(userId(req), rangeFromQuery(req.query));
  if (!(await canSeeWealth(req))) {
    summary.netWorth = 0;
    summary.byCurrency = {};
  }
  res.json(summary);
}

/**
 * Send a report email to the signed-in user right now (to preview/test the
 * scheduled ones). Defaults to the current month-to-date ("midmonth") so the
 * preview shows the user's actual recent activity rather than last month, which
 * is empty for anyone who only started tracking this month. Always sends (no
 * empty-skip) so the user gets delivery confirmation.
 */
export async function sendReportEmailNow(req: Request, res: Response) {
  const user = await User.findById(userId(req));
  if (!user) throw new HttpError(404, "User not found");
  const kind: ReportKind = req.query.kind === "monthly" ? "monthly" : "midmonth";
  await sendReportTo(user, kind, new Date(), req);
  res.json({ ok: true, sentTo: user.email, kind });
}

export async function byCategoryReport(req: Request, res: Response) {
  const { start, end } = rangeFromQuery(req.query);
  const type = (req.query.type === "income" ? "income" : "expense") as "income" | "expense";
  res.json(await getByCategory(userId(req), { start, end, type }));
}

export async function trendReport(req: Request, res: Response) {
  const { start, end } = rangeFromQuery(req.query);
  const granularity = ["day", "week", "month"].includes(String(req.query.granularity))
    ? (req.query.granularity as "day" | "week" | "month")
    : "day";
  res.json(await getTrend(userId(req), { start, end, granularity }));
}

export async function byAccountReport(req: Request, res: Response) {
  res.json(await getByAccount(userId(req), rangeFromQuery(req.query)));
}

const INSIGHT_PERIODS: Period[] = ["week", "month", "year"];

/** Period-over-period spending insights: comparison, category movers, pace. */
export async function insightsReport(req: Request, res: Response) {
  const raw = String(req.query.period ?? "month") as Period;
  const period = INSIGHT_PERIODS.includes(raw) ? raw : "month";
  // A reference date lets the client page backwards/forwards through periods; an
  // invalid or absent value just means "now".
  const parsed = req.query.ref ? new Date(String(req.query.ref)) : new Date();
  const ref = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  res.json(await computeInsights(userId(req), period, ref));
}
