/**
 * Fill an existing account with lifelike sample data, so every screen has
 * something to show while you click around.
 *
 *   npm --prefix server run seed:demo -- --email you@example.com
 *   npm --prefix server run seed:demo -- --email you@example.com --clean
 *
 * Unlike seed:all, this ADDS to whatever is already there — it exists for an
 * account that already has a few budgets but no spending against them. That
 * makes it the one seeder that can double up, so what it writes is marked: the
 * `seed` tag on transactions, a "(sample)" suffix on goals and rules. `--clean`
 * removes exactly those. Budgets have nowhere to carry a mark, so they are only
 * ever added for a category that has none, and --clean leaves them alone.
 *
 * Nothing here touches money you entered yourself.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { Goal } from "../models/Goal";
import { RecurringTransaction } from "../models/RecurringTransaction";

/** Marks everything this script creates, so --clean can find it again. */
const SEED_TAG = "seed";
const SAMPLE = "(sample)";

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
const clean = process.argv.includes("--clean");
const months = Number(arg("--months") ?? 3);

const rint = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(arr: T[]): T => arr[rint(0, arr.length - 1)];

/** A random past moment inside the month `monthsBack` ago, never in the future. */
function dateInMonth(monthsBack: number): Date {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const lastDay =
    monthsBack === 0 ? now.getDate() : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const d = new Date(first);
  d.setDate(rint(1, Math.max(1, lastDay)));
  d.setHours(rint(9, 20), rint(0, 59), 0, 0);
  return d;
}

function monthsFromNow(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return d;
}

async function main() {
  if (!email) {
    console.error("Usage: seed:demo -- --email <email> [--months 3] [--clean]");
    process.exit(1);
  }
  await connectDB();
  console.log(`database: ${mongoose.connection.name}`);

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user "${email}" in this database.`);
    process.exit(1);
  }
  const uid = user._id;

  // ---- Remove a previous run, and stop ----
  if (clean) {
    const txns = await Transaction.deleteMany({ user: uid, tags: SEED_TAG });
    const goals = await Goal.deleteMany({ user: uid, name: { $regex: `\\${SAMPLE}$` } });
    const rules = await RecurringTransaction.deleteMany({ user: uid, note: { $regex: `\\${SAMPLE}$` } });
    console.log(
      `✓ removed ${txns.deletedCount} transactions, ${goals.deletedCount} goals, ${rules.deletedCount} rules`
    );
    // A budget has no note field to mark, so a seeded one is indistinguishable
    // from one you set yourself. They're left alone rather than guessed at —
    // delete any you don't want from the Budgets page.
    console.log("• budgets left in place (nothing marks them as sample)");
    await mongoose.disconnect();
    return;
  }

  const INR = { currency: "INR", user: uid } as const;
  const accounts = await Account.find({ user: uid, archived: false, system: null }).lean();
  if (!accounts.length) {
    console.error("No accounts — create one (or run seed:all) first.");
    process.exit(1);
  }
  const bank = accounts.find((a) => a.type === "bank") ?? accounts[0];
  const spendFrom = accounts.filter((a) => a.type !== "securities");

  const cats = await Category.find({ user: uid }).lean();
  const expenseCats = cats.filter((c) => c.type === "expense");
  const income = cats.find((c) => c.type === "income" && /salary/i.test(c.name)) ?? cats.find((c) => c.type === "income");
  if (!expenseCats.length) {
    console.error("No expense categories — run the normal seed first.");
    process.exit(1);
  }

  // ---- Spending, so budgets and charts have something to show ----
  // Weighted towards the categories people actually use daily, and dense in the
  // current month so "this month" views aren't empty early in the month.
  const everyday = expenseCats.filter((c) =>
    /food|dining|grocer|transport|fuel|shopping|entertain|health|subscription|recharge|tea|snack|travel|house|bill|util/i.test(
      c.name
    )
  );
  const spendCats = everyday.length >= 4 ? everyday : expenseCats;

  const txns: Record<string, unknown>[] = [];
  for (let m = 0; m < months; m++) {
    if (income) {
      const salary = new Date();
      salary.setMonth(salary.getMonth() - m, 1);
      salary.setHours(10, 0, 0, 0);
      if (salary <= new Date()) {
        txns.push({
          ...INR,
          type: "income",
          amount: rint(60000, 75000),
          account: bank._id,
          category: income._id,
          date: salary,
          note: "Monthly salary",
          payee: "Employer",
          tags: [SEED_TAG],
        });
      }
    }
    const count = m === 0 ? 26 : rint(18, 24);
    for (let i = 0; i < count; i += 1) {
      const cat = pick(spendCats);
      txns.push({
        ...INR,
        type: "expense",
        amount: rint(120, 3200),
        account: pick(spendFrom)._id,
        category: cat._id,
        date: dateInMonth(m),
        note: cat.name,
        payee: pick(["Swiggy", "Amazon", "BigBasket", "IOCL", "Apollo", "Netflix", "Local shop"]),
        tags: [SEED_TAG],
      });
    }
  }
  await Transaction.insertMany(txns);
  console.log(`✓ ${txns.length} transactions across ${months} month(s)`);

  // ---- Budgets for the categories that now have spending ----
  const wanted = spendCats.slice(0, 8);
  const existing = new Set(
    (await Budget.find({ user: uid }).select("category").lean()).map((b) => String(b.category))
  );
  const budgets = wanted
    .filter((c) => !existing.has(String(c._id)))
    .map((c) => ({
      ...INR,
      category: c._id,
      amount: rint(2, 12) * 1000,
      period: "monthly",
      startDate: new Date(),
    }));
  if (budgets.length) await Budget.insertMany(budgets);
  console.log(`✓ ${budgets.length} budgets (existing ones left alone)`);

  // ---- Goals, including the two newer shapes ----
  const wallet = accounts.find((a) => /saving|wallet/i.test(a.name) && a.type !== "securities");
  const linkedTaken = new Set(
    (await Goal.find({ user: uid, linkedAccount: { $ne: null } }).select("linkedAccount").lean()).map((g) =>
      String(g.linkedAccount)
    )
  );
  const goals: Record<string, unknown>[] = [
    {
      ...INR,
      name: `New laptop ${SAMPLE}`,
      targetAmount: 90000,
      savedAmount: 32000,
      targetDate: monthsFromNow(8),
      monthlyContribution: 7000,
      color: "#6366F1",
      icon: "goal",
    },
    {
      // A repeating sinking fund — the yearly-bill shape.
      ...INR,
      name: `Car insurance ${SAMPLE}`,
      targetAmount: 12000,
      savedAmount: 4000,
      targetDate: monthsFromNow(5),
      monthlyContribution: 1000,
      repeat: "yearly",
      color: "#10B981",
      icon: "shield",
    },
  ];
  // A wallet-tracking goal, only if there's a spare account to track.
  if (wallet && !linkedTaken.has(String(wallet._id))) {
    goals.push({
      ...INR,
      name: `Emergency fund ${SAMPLE}`,
      targetAmount: 500000,
      targetDate: monthsFromNow(24),
      linkedAccount: wallet._id,
      color: "#F59E0B",
      icon: "piggy-bank",
    });
  }
  await Goal.insertMany(goals);
  console.log(`✓ ${goals.length} goals${wallet ? "" : " (no spare account to track, so none linked)"}`);

  // ---- A couple of recurring rules, due soon ----
  const soon = new Date();
  soon.setDate(soon.getDate() + 2);
  const rentCat = expenseCats.find((c) => /rent|house/i.test(c.name)) ?? expenseCats[0];
  const subCat = expenseCats.find((c) => /subscription|entertain/i.test(c.name)) ?? expenseCats[0];
  const rules = [
    {
      ...INR,
      type: "expense",
      amount: 16000,
      account: bank._id,
      category: rentCat._id,
      payee: "Landlord",
      note: `House rent ${SAMPLE}`,
      frequency: "monthly",
      interval: 1,
      startDate: soon,
      nextRun: soon,
    },
    {
      ...INR,
      type: "expense",
      amount: 649,
      account: bank._id,
      category: subCat._id,
      payee: "Netflix",
      note: `Streaming ${SAMPLE}`,
      frequency: "monthly",
      interval: 1,
      startDate: soon,
      nextRun: soon,
    },
  ];
  await RecurringTransaction.insertMany(rules);
  console.log(`✓ ${rules.length} recurring rules`);

  console.log(`\n✓ Seeded ${email}. Undo with the same command plus --clean.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
