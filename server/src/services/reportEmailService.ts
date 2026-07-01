import { format } from "date-fns";
import type { Types } from "mongoose";
import { env } from "../config/env";
import { User, type UserDoc } from "../models/User";
import { getSettings } from "../models/Settings";
import { getSummary, getByCategory } from "./reportService";
import { sendMail } from "../mail/mailer";
import { startOfMonth, addMonths, addDays, startOfDay } from "../utils/dateRange";

const APP_NAME = "Money Tracker";

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
      label: format(start, "MMMM yyyy"),
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
    label: `1–${now.getDate()} ${format(now, "MMM yyyy")}`,
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
  return {
    summary,
    savingsRate: summary.income > 0 ? Math.round((summary.net / summary.income) * 100) : null,
    momPct: prev.expense > 0 ? Math.round(((summary.expense - prev.expense) / prev.expense) * 100) : null,
    top: cats.slice(0, 5),
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
  fmt: Money
): { subject: string; html: string; text: string } {
  const name = user.name?.trim().split(" ")[0] || "there";
  const { summary, savingsRate, momPct, top } = data;
  const subject = `${p.title} · ${p.label}`;
  const reportsUrl = `${env.appUrl}/reports`;

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

        <h3 style="margin:24px 0 8px;font-size:14px;color:#0f172a;">Top spending</h3>
        <table role="presentation" width="100%" style="border-collapse:collapse;">${topRows}</table>

        <div style="text-align:center;margin-top:28px;">
          <a href="${reportsUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:14px;font-weight:600;">View full report</a>
        </div>
      </div>
      <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
        You're getting this because report emails are on. Turn them off anytime in ${esc(APP_NAME)} → Settings.
      </div>
    </div>
  </div>`;

  const text =
    `${p.title} — ${p.label}\n\n` +
    `Income: ${fmt(summary.income)}\nExpense: ${fmt(summary.expense)}\nNet: ${fmt(summary.net)}\n` +
    `${savingsRate == null ? "" : `Savings rate: ${savingsRate}%\n`}` +
    `Net worth: ${fmt(summary.netWorth)}\n\n` +
    `Top spending:\n${top.map((c) => `  ${c.name}: ${fmt(c.total)} (${c.percent}%)`).join("\n") || "  none"}\n\n` +
    `View full report: ${reportsUrl}`;

  return { subject, html, text };
}

/** Build + email a report of the given kind to a single user (used by the scheduler and the test endpoint). */
export async function sendReportTo(user: UserDoc & { _id: Types.ObjectId | unknown }, kind: ReportKind, now = new Date()) {
  const uid = String(user._id);
  const period = periodForKind(kind, now);
  const fmt = await moneyFormatter(uid);
  const data = await buildData(uid, period);
  const { subject, html, text } = renderEmail(user, kind, period, data, fmt);
  await sendMail({ to: user.email, subject, html, text });
}

/**
 * Scheduler entry point. Sends the monthly report on the 1st and the mid-month
 * check-in on the 15th, to every verified user who hasn't opted out. Idempotent
 * per day (User.lastReportKey), so a cron + boot double-run can't send twice.
 */
export async function sendDueReports(now = new Date()): Promise<{ kind: ReportKind | null; sent: number }> {
  const day = now.getDate();
  const kind: ReportKind | null = day === 1 ? "monthly" : day === 15 ? "midmonth" : null;
  if (!kind) return { kind: null, sent: 0 };

  const key = format(now, "yyyy-MM-dd");
  const users = await User.find({ emailVerified: true });
  let sent = 0;

  for (const user of users) {
    if (user.lastReportKey === key) continue; // already sent today
    try {
      const settings = await getSettings(String(user._id));
      if (settings.emailReports === false) continue;
      await sendReportTo(user, kind, now);
      user.lastReportKey = key;
      await user.save();
      sent += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[report-email] failed for", user.email, e);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[report-email] ${kind} run: sent ${sent} report(s)`);
  return { kind, sent };
}
