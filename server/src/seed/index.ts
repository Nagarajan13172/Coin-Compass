import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { User } from "../models/User";
import { provisionUser } from "../services/authService";
import { hashPassword } from "../auth/password";

/**
 * Seed a user + workspace, optionally with demo transactions.
 *
 *   npm run seed                                          # demo@moneytracker.local / demo1234
 *   npm run seed -- --demo                                # ...plus ~60 sample transactions
 *   npm run seed -- --email you@example.com --demo        # seed for a specific address
 *   npm run seed -- --email you@example.com --password s3cret --name "You" --demo
 *
 * Safe to re-run: an existing user is reused (not duplicated), and demo data is
 * skipped if that user already has transactions. Seeded accounts are created with
 * emailVerified=true (no verification screen) and a password, and signing in with
 * Google using the same address links to the very same account.
 */

const DEMO_EMAIL = "demo@moneytracker.local";
const DEMO_PASSWORD = "demo1234";

/** Read `--flag value` or `--flag=value` from argv. */
function arg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = args.indexOf(flag);
  const next = args[i + 1];
  if (i >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}

const demo = process.argv.includes("--demo");
const email = (arg("--email") ?? DEMO_EMAIL).toLowerCase().trim();
const password = arg("--password") ?? DEMO_PASSWORD;
const name = arg("--name") ?? email.split("@")[0];

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Ensure the user exists and is provisioned (settings + default categories + Cash account). */
async function seedUser() {
  let user = await User.findOne({ email });
  if (user) {
    console.log(`• User already exists (${email}); reusing their workspace.`);
    return user;
  }
  user = await User.create({
    email,
    name,
    passwordHash: await hashPassword(password),
    emailVerified: true,
  });
  await provisionUser(user._id);
  console.log(`✓ Created user and workspace for ${email}.`);
  console.log(`  Password login → ${email} / ${password}`);
  console.log(`  Google sign-in with this address links to the same account.`);
  return user;
}

async function seedDemoData(userId: mongoose.Types.ObjectId) {
  if (!demo) return;
  const txnCount = await Transaction.countDocuments({ user: userId });
  if (txnCount > 0) {
    console.log(`• User already has transactions (${txnCount}), skipping demo data.`);
    return;
  }

  const bank = await Account.create({
    user: userId,
    name: "Bank Account",
    type: "bank",
    initialBalance: 50000,
    currency: "INR",
    color: "#3B82F6",
    icon: "landmark",
  });
  const cash = (await Account.findOne({ user: userId, name: "Cash" })) ?? bank;

  const expenseCats = await Category.find({ user: userId, type: "expense" });
  const incomeCats = await Category.find({ user: userId, type: "income" });

  const now = new Date();
  const txns: Record<string, unknown>[] = [];

  for (let monthBack = 0; monthBack < 2; monthBack++) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthBack, 1);
    txns.push({
      user: userId,
      type: "income",
      amount: 65000,
      account: bank._id,
      category: incomeCats.find((c) => c.name === "Salary")?._id ?? incomeCats[0]?._id,
      date: d,
      note: "Monthly salary",
      currency: "INR",
    });
  }

  for (let i = 0; i < 60; i++) {
    const cat = expenseCats[randomInt(0, expenseCats.length - 1)];
    const day = new Date(now);
    day.setDate(now.getDate() - randomInt(0, 55));
    txns.push({
      user: userId,
      type: "expense",
      amount: randomInt(80, 4500),
      account: Math.random() > 0.5 ? cash._id : bank._id,
      category: cat._id,
      date: day,
      note: cat.name,
      currency: "INR",
    });
  }

  await Transaction.insertMany(txns);
  console.log(`✓ Seeded ${txns.length} demo transactions.`);
}

async function main() {
  await connectDB();
  const user = await seedUser();
  await seedDemoData(user._id as mongoose.Types.ObjectId);
  await mongoose.disconnect();
  console.log("✓ Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
