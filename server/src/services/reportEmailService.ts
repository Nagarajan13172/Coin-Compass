import type { Types } from "mongoose";
import { User, type UserDoc } from "../models/User";
import { getSettings } from "../models/Settings";
import { getSummary, getByCategory } from "./reportService";
import { exportTransactionsCsv } from "./csvService";
import { sendMail } from "../mail/mailer";
import { startOfMonth, addMonths, addDays, startOfDay } from "../utils/dateRange";
import type { Request } from "express";
import { publicAppOrigin } from "../utils/publicOrigin";

const APP_NAME = "CoinCompass";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const monthYear = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
const shortMonthYear = (d: Date) => `${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export type ReportKind = "monthly" | "midmonth";

interface Period {
  start: Date;
  end: Date; // exclusive
  prevStart: Date;
  prevEnd: Date;
  label: string;
  title: string;
}

/** The 1st sends last month's report; the 15th sends a month-to-date check-in. */
function periodForKind(kind: ReportKind, now: Date): Period {
  if (kind === "monthly") {
    const start = startOfMonth(addMonths(now, -1));
    const end = startOfMonth(now);
    return {
      start,
      end,
      prevStart: startOfMonth(addMonths(now, -2)),
      prevEnd: start,
      label: monthYear(start),
      title: "Your monthly report",
    };
  }
  // mid-month: this month so far, compared to the same span of last month.
  const start = startOfMonth(now);
  const end = startOfDay(addDays(now, 1)); // include today
  const daysIn = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  const prevStart = startOfMonth(addMonths(now, -1));
  return {
    start,
    end,
    prevStart,
    prevEnd: addDays(prevStart, daysIn),
    label: `1–${now.getDate()} ${shortMonthYear(now)}`,
    title: "Mid-month check-in",
  };
}

type Money = (n: number) => string;

async function moneyFormatter(userId: string): Promise<Money> {
  const settings = await getSettings(userId);
  const cur = settings.currencies.find((c) => c.code === settings.baseCurrency);
  const symbol = cur?.symbol ?? "₹";
  const locale = settings.locale || "en-IN";
  return (n: number) => `${symbol}${Math.round(n).toLocaleString(locale)}`;
}

async function buildData(userId: string, p: Period) {
  const [summary, prev, cats] = await Promise.all([
    getSummary(userId, { start: p.start, end: p.end }),
    getSummary(userId, { start: p.prevStart, end: p.prevEnd }),
    getByCategory(userId, { start: p.start, end: p.end, type: "expense" }),
  ]);

  // Pace / runway. Boundaries are local midnights, so a plain ms→days division is
  // exact. `daysElapsed` is the span the report covers (the full month for the
  // completed monthly report; month-to-date for the mid-month check-in), and
  // `daysRemaining` is what's left in that calendar month (0 once it's over).
  const daysInMonth = new Date(p.start.getFullYear(), p.start.getMonth() + 1, 0).getDate();
  const daysElapsed = Math.max(1, Math.round((p.end.getTime() - p.start.getTime()) / 86_400_000));
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);
  const avgDailySpend = summary.expense / daysElapsed;

  return {
    summary,
    savingsRate: summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : null,
    momPct: prev.expense > 0 ? Math.round(((summary.expense - prev.expense) / prev.expense) * 100) : null,
    top: cats.slice(0, 5),
    pace: {
      daysInMonth,
      daysElapsed,
      daysRemaining,
      avgDailySpend,
      // Straight-line projection of month-end spend at the current daily rate.
      projectedSpend: avgDailySpend * daysInMonth,
      // This month's surplus spread over the days left — a rough "you can spend
      // up to this per remaining day and still end the month in the black" cushion.
      // Null when the month is over or there's no surplus to spread.
      perRemainingDay: daysRemaining > 0 && summary.net > 0 ? summary.net / daysRemaining : null,
      txCount: summary.incomeCount + summary.expenseCount,
    },
  };
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

function renderEmail(
  user: UserDoc,
  kind: ReportKind,
  p: Period,
  data: Awaited<ReturnType<typeof buildData>>,
  fmt: Money,
  req?: Request,
  csvFilename?: string
): { subject: string; html: string; text: string } {
  const name = user.name?.trim().split(" ")[0] || "there";
  const { summary, savingsRate, momPct, top, pace } = data;
  const subject = `${p.title} · ${p.label}`;
  const reportsUrl = new URL("/reports", `${publicAppOrigin(req)}/`).toString();
  const monthName = MONTHS[p.start.getMonth()];
  const plural = (n: number) => (n === 1 ? "" : "s");

  const stat = (label: string, value: string, color: string) => `
    <td style="padding:8px;text-align:center;">
      <div style="font-size:12px;color:#64748b;">${label}</div>
      <div style="font-size:20px;font-weight:700;color:${color};">${value}</div>
    </td>`;

  const momLine =
    momPct == null
      ? ""
      : `<p style="margin:4px 0 0;font-size:13px;color:#64748b;">Spending is ${
          momPct === 0
            ? "about the same as"
            : `<b style="color:${momPct > 0 ? "#dc2626" : "#059669"};">${Math.abs(momPct)}% ${
                momPct > 0 ? "higher" : "lower"
              }</b> than`
        } the previous period.</p>`;

  // Runway / pace. For the mid-month check-in this is a forward-looking card
  // (days left, current pace, projection, per-day cushion); for the completed
  // monthly report it's a one-line retrospective daily average.
  const cushionLine =
    pace.perRemainingDay != null
      ? ` You have about <b style="color:#059669;">${fmt(pace.perRemainingDay)}/day</b> of room for the days left and still finish the month positive.`
      : "";
  const runwayBlock =
    pace.daysRemaining > 0
      ? `
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;margin-top:16px;">
          <div style="font-size:13px;color:#0f172a;line-height:1.55;">
            <b>${pace.daysRemaining} day${plural(pace.daysRemaining)} left</b> in ${esc(monthName)}. You're spending <b>${fmt(pace.avgDailySpend)}/day</b>, on track for about <b>${fmt(pace.projectedSpend)}</b> this month.${cushionLine}
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-top:6px;">Based on ${pace.txCount} transaction${plural(pace.txCount)} across the first ${pace.daysElapsed} day${plural(pace.daysElapsed)}.</div>
        </div>`
      : `<p style="margin:12px 0 0;font-size:13px;color:#64748b;">That's an average of <b style="color:#0f172a;">${fmt(pace.avgDailySpend)}/day</b> over ${pace.daysInMonth} days · <b style="color:#0f172a;">${pace.txCount}</b> transaction${plural(pace.txCount)}.</p>`;

  const topRows =
    top.length === 0
      ? `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;">No spending recorded.</td></tr>`
      : top
          .map(
            (c) => `
      <tr>
        <td style="padding:6px 0;font-size:14px;color:#0f172a;">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${c.color};margin-right:8px;"></span>${esc(
            c.name
          )}
        </td>
        <td style="padding:6px 0;text-align:right;font-size:14px;color:#64748b;">${c.percent}%</td>
        <td style="padding:6px 0;text-align:right;font-size:14px;font-weight:600;color:#0f172a;">${fmt(c.total)}</td>
      </tr>`
          )
          .join("");

  const html = `
  <div style="background:#f1f5f9;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#2563eb;padding:20px 24px;color:#fff;">
        <div style="font-size:13px;opacity:.85;">${esc(APP_NAME)}</div>
        <div style="font-size:20px;font-weight:700;">${esc(p.title)}</div>
        <div style="font-size:13px;opacity:.9;">${esc(p.label)}</div>
      </div>
      <div style="padding:24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#0f172a;">Hi ${esc(name)}, here's your ${
          kind === "monthly" ? "summary for last month" : "month so far"
        }.</p>

        <table role="presentation" width="100%" style="border-collapse:collapse;background:#f8fafc;border-radius:12px;">
          <tr>
            ${stat("Income", fmt(summary.income), "#059669")}
            ${stat("Expense", fmt(summary.expense), "#dc2626")}
            ${stat("Net", `${summary.net >= 0 ? "+" : "−"}${fmt(Math.abs(summary.net))}`, summary.net >= 0 ? "#059669" : "#dc2626")}
          </tr>
        </table>
        <p style="margin:12px 0 0;font-size:13px;color:#64748b;">
          ${savingsRate == null ? "" : `Savings rate: <b style="color:#0f172a;">${savingsRate < -100 ? "&lt; −100%" : savingsRate + "%"}</b> · `}Net worth: <b style="color:#0f172a;">${fmt(summary.netWorth)}</b>
        </p>
        ${momLine}
        ${runwayBlock}

        <h3 style="margin:24px 0 8px;font-size:14px;color:#0f172a;">Top spending</h3>
        <table role="presentation" width="100%" style="border-collapse:collapse;">${topRows}</table>

        <div style="text-align:center;margin-top:28px;">
          <a href="${reportsUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;">View full report</a>
        </div>
        ${
          csvFilename
            ? `<p style="margin:16px 0 0;text-align:center;font-size:12px;color:#94a3b8;">📎 Your transactions for this period are attached as <b style="color:#64748b;">${esc(csvFilename)}</b>.</p>`
            : ""
        }
      </div>
      <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
        You're getting this because report emails are on. Turn them off anytime in ${esc(APP_NAME)} → Settings.
      </div>
    </div>
  </div>`;

  const paceText =
    pace.daysRemaining > 0
      ? `${pace.daysRemaining} day${plural(pace.daysRemaining)} left in ${monthName}. Spending ${fmt(
          pace.avgDailySpend
        )}/day, on track for ~${fmt(pace.projectedSpend)} this month.${
          pace.perRemainingDay != null
            ? ` About ${fmt(pace.perRemainingDay)}/day of room for the days left.`
            : ""
        }\n`
      : `Average ${fmt(pace.avgDailySpend)}/day over ${pace.daysInMonth} days · ${pace.txCount} transaction${plural(
          pace.txCount
        )}.\n`;

  const text =
    `${p.title} — ${p.label}\n\n` +
    `Income: ${fmt(summary.income)}\nExpense: ${fmt(summary.expense)}\nNet: ${fmt(summary.net)}\n` +
    `${savingsRate == null ? "" : `Savings rate: ${savingsRate}%\n`}` +
    `Net worth: ${fmt(summary.netWorth)}\n\n` +
    paceText +
    `\nTop spending:\n${top.map((c) => `  ${c.name}: ${fmt(c.total)} (${c.percent}%)`).join("\n") || "  none"}\n\n` +
    `${csvFilename ? `Attached: ${csvFilename} (all transactions for this period)\n\n` : ""}` +
    `View full report: ${reportsUrl}`;

  return { subject, html, text };
}

/**
 * Build + email a report of the given kind to a single user (used by the scheduler
 * and the on-demand test endpoint). Returns whether an email was actually sent.
 *
 * With `skipIfEmpty`, a period that has no income, expense, or spending sends
 * nothing (an all-zero email reads as broken) and returns false. The on-demand
 * test never opts into this — the user asked for it and wants delivery confirmed.
 */
export async function sendReportTo(
  user: UserDoc & { _id: Types.ObjectId | unknown },
  kind: ReportKind,
  now = new Date(),
  req?: Request,
  opts: { skipIfEmpty?: boolean } = {}
): Promise<boolean> {
  const uid = String(user._id);
  const period = periodForKind(kind, now);
  const data = await buildData(uid, period);
  if (
    opts.skipIfEmpty &&
    data.summary.income === 0 &&
    data.summary.expense === 0 &&
    data.top.length === 0
  ) {
    return false;
  }
  const fmt = await moneyFormatter(uid);

  // Attach the period's transactions as a CSV (same format as the in-app export).
  // Only when there's at least one row — a header-only file isn't worth attaching.
  const csv = await exportTransactionsCsv(uid, period.start, period.end);
  const hasRows = csv.includes("\n");
  const csvFilename = hasRows ? `coincompass-${ym(period.start)}.csv` : undefined;

  const { subject, html, text } = renderEmail(user, kind, period, data, fmt, req, csvFilename);
  await sendMail({
    to: user.email,
    subject,
    html,
    text,
    attachments: csvFilename ? [{ filename: csvFilename, content: csv, contentType: "text/csv; charset=utf-8" }] : undefined,
  });
  return true;
}

/**
 * Scheduler entry point. Sends the monthly report on the 1st and the mid-month
 * check-in on the 15th, to every verified user who hasn't opted out. Idempotent
 * per day (User.lastReportKey), so a cron + boot double-run can't send twice.
 */
export async function sendDueReports(now = new Date()): Promise<{ kind: ReportKind | null; sent: number }> {
  // The 1st wraps up last month; the 15th checks in on the current month so far.
  const day = now.getDate();
  const kind: ReportKind | null = day === 1 ? "monthly" : day === 15 ? "midmonth" : null;
  if (!kind) return { kind: null, sent: 0 };

  const key = ymd(now);
  const users = await User.find({ emailVerified: true });
  let sent = 0;

  for (const user of users) {
    if (user.lastReportKey === key) continue; // already handled today
    try {
      const settings = await getSettings(String(user._id));
      if (settings.emailReports === false) continue;
      const didSend = await sendReportTo(user, kind, now, undefined, { skipIfEmpty: true });
      if (didSend) sent += 1;
      // Mark the day handled even when the period was empty, so a boot re-run on
      // the same day doesn't reprocess this user.
      user.lastReportKey = key;
      await user.save();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[report-email] failed for", user.email, e);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[report-email] ${kind} run: sent ${sent} report(s)`);
  return { kind, sent };
}
