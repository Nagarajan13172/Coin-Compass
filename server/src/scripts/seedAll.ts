/**
 * Populate EVERY section with realistic sample data for a single existing user,
 * so the whole app (dashboard, reports, budgets, goals, net worth) looks alive.
 *
 *   npm --prefix server run seed:all -- --email you@example.com
 *
 * Idempotent per section: a section is only seeded if it's currently empty for
 * that user, so re-running won't duplicate.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Goal } from "../models/Goal";
import { Holding } from "../models/Holding";
import { Loan } from "../models/Loan";
import { RecurringTransaction } from "../models/RecurringTransaction";

function arg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = args.indexOf(flag);
  const next = args[i + 1];
  if (i >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}

const email = (arg("--email") ?? "").toLowerCase().trim();

const rint = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(arr: T[]): T => arr[rint(0, arr.length - 1)];
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d;
}
function monthFirst(monthsBack: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsBack, 1);
  d.setHours(12, 0, 0, 0);
  return d;
}
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}
/** A random datetime within the calendar month `monthsBack` ago (current month
 *  is capped at today, so we never seed future-dated spending). */
function dateInMonth(monthsBack: number) {
  const now = new Date();
  const maxDay = monthsBack === 0 ? now.getDate() : 28;
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, rint(1, maxDay));
  d.setHours(rint(9, 20), rint(0, 59), 0, 0);
  return d;
}

async function main() {
  if (!email) {
    console.error("Usage: seed:all -- --email <email>");
    process.exit(1);
  }
  await connectDB();
  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user "${email}" — sign up / seed the user first.`);
    process.exit(1);
  }
  const uid = user._id;
  const INR = { currency: "INR", user: uid } as const;

  // ---- Accounts ----
  async function ensureAccount(name: string, extra: Record<string, unknown>) {
    let acc = await Account.findOne({ user: uid, name });
    if (!acc) acc = await Account.create({ user: uid, name, ...extra });
    return acc;
  }
  const cash = await ensureAccount("Cash", { type: "cash", icon: "wallet", color: "#2563EB", initialBalance: 3000 });
  const bank = await ensureAccount("HDFC Bank", { type: "bank", icon: "landmark", color: "#3B82F6", initialBalance: 40000 });
  const card = await ensureAccount("ICICI Credit Card", { type: "card", icon: "credit-card", color: "#8B5CF6", initialBalance: 0 });
  const wallet = await ensureAccount("Paytm Wallet", { type: "wallet", icon: "smartphone", color: "#10B981", initialBalance: 1500 });
  console.log("✓ accounts ready");

  // Category lookup by name
  const cats = await Category.find({ user: uid }).lean();
  const byName = (n: string) => cats.find((c) => c.name === n);
  const expenseAccounts = [cash, bank, card, wallet];

  // ---- Transactions (last ~3 months) ----
  if ((await Transaction.countDocuments({ user: uid })) === 0) {
    const txns: Record<string, unknown>[] = [];
    // salary + rent for the last 3 months
    for (let m = 0; m < 3; m++) {
      // rent on the 5th, but never in the future (current month falls back to today)
      const rentDate = m === 0 ? daysAgo(0) : new Date(monthFirst(m).getTime() + 4 * 864e5);
      txns.push({ ...INR, type: "income", amount: 68000, account: bank._id, category: byName("Salary")?._id, date: monthFirst(m), note: "Monthly salary", payee: "Employer" });
      txns.push({ ...INR, type: "expense", amount: 16000, account: bank._id, category: byName("Rent")?._id, date: rentDate, note: "House rent", payee: "Landlord" });
    }
    // a couple of extra income bits
    txns.push({ ...INR, type: "income", amount: 12000, account: bank._id, category: byName("Freelance")?._id, date: daysAgo(20), note: "Freelance project" });
    txns.push({ ...INR, type: "income", amount: 1800, account: bank._id, category: byName("Interest")?._id, date: daysAgo(9), note: "FD interest" });
    // everyday expenses across categories. Seed a dense current month (so budgets
    // and "this month" charts have data even early in the month) plus history for
    // the trend and month-over-month insight.
    const spend: [string, number, number][] = [
      ["Food & Dining", 120, 900],
      ["Groceries", 300, 2500],
      ["Transport", 40, 400],
      ["Fuel", 500, 2500],
      ["Shopping", 400, 6000],
      ["Entertainment", 150, 1200],
      ["Bills & Utilities", 300, 2200],
      ["Subscriptions", 149, 999],
      ["Health", 200, 3000],
      ["Personal Care", 100, 800],
    ];
    const perMonth = [22, 20, 16]; // this month, last month, 2 months ago
    perMonth.forEach((count, monthsBack) => {
      for (let i = 0; i < count; i++) {
        const [catName, lo, hi] = pick(spend);
        txns.push({
          ...INR,
          type: "expense",
          amount: rint(lo, hi),
          account: pick(expenseAccounts)._id,
          category: byName(catName)?._id,
          date: dateInMonth(monthsBack),
          note: catName,
          tags: Math.random() > 0.8 ? [pick(["Hari", "Family", "Work", "Bed"])] : [],
        });
      }
    });
    // a transfer (Bank -> Cash)
    txns.push({ ...INR, type: "transfer", amount: 5000, account: bank._id, toAccount: cash._id, date: daysAgo(6), note: "ATM withdrawal" });
    await Transaction.insertMany(txns);
    console.log(`✓ seeded ${txns.length} transactions`);
  } else {
    console.log("• transactions already present, skipped");
  }

  // ---- Budgets ----
  if ((await Budget.countDocuments({ user: uid })) === 0) {
    const budgets = [
      ["Food & Dining", 9000],
      ["Groceries", 7000],
      ["Entertainment", 3000],
      ["Fuel", 5000],
      ["Shopping", 6000],
    ];
    await Budget.insertMany(
      budgets.map(([name, amount]) => ({ ...INR, category: byName(String(name))?._id, amount, period: "monthly", startDate: monthFirst(0) }))
    );
    console.log(`✓ seeded ${budgets.length} budgets`);
  } else console.log("• budgets already present, skipped");

  // ---- Goals ----
  if ((await Goal.countDocuments({ user: uid })) === 0) {
    await Goal.insertMany([
      { ...INR, name: "Emergency Fund", targetAmount: 300000, savedAmount: 180000, monthlyContribution: 20000, color: "#F59E0B", icon: "shield" },
      { ...INR, name: "New Bike", targetAmount: 150000, savedAmount: 55000, monthlyContribution: 12000, targetDate: inDays(240), color: "#6366F1", icon: "bike" },
      { ...INR, name: "Goa Trip", targetAmount: 60000, savedAmount: 60000, monthlyContribution: 0, color: "#10B981", icon: "plane", achievedAt: new Date() },
    ]);
    console.log("✓ seeded 3 goals");
  } else console.log("• goals already present, skipped");

  // ---- Holdings (assets) ----
  if ((await Holding.countDocuments({ user: uid })) === 0) {
    await Holding.insertMany([
      { ...INR, name: "HDFC Fixed Deposit", class: "saving", subtype: "fixed_deposit", value: 250000, provider: "HDFC Bank" },
      { ...INR, name: "SBI Recurring Deposit", class: "saving", subtype: "recurring_deposit", value: 60000, provider: "SBI" },
      { ...INR, name: "Emergency Fund", class: "saving", subtype: "emergency_fund", value: 100000 },
      { ...INR, name: "NPS", class: "saving", subtype: "retirement_fund", value: 90000, provider: "NPS" },
      { ...INR, name: "Zerodha Stocks", class: "investment", subtype: "stocks", value: 175000, provider: "Zerodha" },
      { ...INR, name: "Nifty 50 Index Fund", class: "investment", subtype: "mutual_funds", value: 130000, provider: "Groww" },
      { ...INR, name: "Plot - Coimbatore", class: "investment", subtype: "real_estate", value: 800000 },
      { ...INR, name: "Gold Jewellery", class: "investment", subtype: "gold", value: 120000 },
      { ...INR, name: "Govt Bonds", class: "investment", subtype: "bonds", value: 50000 },
    ]);
    console.log("✓ seeded 9 holdings");
  } else console.log("• holdings already present, skipped");

  // ---- Loans (liabilities) ----
  if ((await Loan.countDocuments({ user: uid })) === 0) {
    await Loan.insertMany([
      { ...INR, name: "Home Loan", lender: "HDFC", type: "home", principal: 3000000, outstanding: 2450000, roi: 8.6, emi: 24000, startDate: new Date("2022-06-01"), status: "active" },
      { ...INR, name: "Car Loan", lender: "ICICI", type: "car", principal: 600000, outstanding: 320000, roi: 9.5, emi: 12500, startDate: new Date("2023-03-01"), status: "active" },
      { ...INR, name: "Personal Loan", lender: "Bajaj", type: "personal", principal: 200000, outstanding: 110000, roi: 14, emi: 6500, startDate: new Date("2024-01-01"), status: "active" },
    ]);
    console.log("✓ seeded 3 loans");
  } else console.log("• loans already present, skipped");

  // ---- Recurring rules (shown as "Due soon") ----
  if ((await RecurringTransaction.countDocuments({ user: uid })) === 0) {
    await RecurringTransaction.insertMany([
      { ...INR, type: "expense", amount: 16000, account: bank._id, category: byName("Rent")?._id, note: "House rent", frequency: "monthly", interval: 1, startDate: monthFirst(0), nextRun: inDays(3), active: true },
      { ...INR, type: "expense", amount: 649, account: card._id, category: byName("Subscriptions")?._id, note: "Netflix", payee: "Netflix", frequency: "monthly", interval: 1, startDate: monthFirst(0), nextRun: inDays(6), active: true },
      { ...INR, type: "income", amount: 68000, account: bank._id, category: byName("Salary")?._id, note: "Monthly salary", frequency: "monthly", interval: 1, startDate: monthFirst(0), nextRun: inDays(9), active: true },
    ]);
    console.log("✓ seeded 3 recurring rules");
  } else console.log("• recurring already present, skipped");

  await mongoose.disconnect();
  console.log(`\n✓ All sections seeded for ${email}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
