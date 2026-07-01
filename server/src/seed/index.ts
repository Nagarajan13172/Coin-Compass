import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { User } from "../models/User";
import { provisionUser } from "../services/authService";
import { hashPassword } from "../auth/password";

const demo = process.argv.includes("--demo");

// A ready-to-use local login so you can sign in immediately after seeding.
const DEMO_EMAIL = "demo@moneytracker.local";
const DEMO_PASSWORD = "demo1234";

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Ensure the demo user exists and is provisioned (settings + default categories + Cash account). */
async function seedDemoUser() {
  let user = await User.findOne({ email: DEMO_EMAIL });
  if (user) {
    console.log(`• Demo user already exists (${DEMO_EMAIL}).`);
    return user;
  }
  user = await User.create({
    email: DEMO_EMAIL,
    name: "Demo",
    passwordHash: await hashPassword(DEMO_PASSWORD),
    emailVerified: true,
  });
  await provisionUser(user._id);
  console.log(`✓ Created demo user and workspace.`);
  console.log(`  Login → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  return user;
}

async function seedDemoData(userId: mongoose.Types.ObjectId) {
  if (!demo) return;
  const txnCount = await Transaction.countDocuments({ user: userId });
  if (txnCount > 0) {
    console.log(`• Demo user already has transactions (${txnCount}), skipping demo data.`);
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
  const user = await seedDemoUser();
  await seedDemoData(user._id as mongoose.Types.ObjectId);
  await mongoose.disconnect();
  console.log("✓ Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
