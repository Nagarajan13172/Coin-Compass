import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { Transaction } from "../models/Transaction";
import { getSettings } from "../models/Settings";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "./defaults";

const demo = process.argv.includes("--demo");

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function seedCategories() {
  const count = await Category.countDocuments();
  if (count > 0) {
    console.log(`• Categories already exist (${count}), skipping.`);
    return;
  }
  const expense = DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({
    ...c,
    type: "expense" as const,
    order: i,
    isDefault: true,
  }));
  const income = DEFAULT_INCOME_CATEGORIES.map((c, i) => ({
    ...c,
    type: "income" as const,
    order: i,
    isDefault: true,
  }));
  await Category.insertMany([...expense, ...income]);
  console.log(`✓ Seeded ${expense.length + income.length} categories.`);
}

async function seedSettings() {
  await getSettings();
  console.log("✓ Settings singleton ready.");
}

async function seedStarterAccount() {
  const count = await Account.countDocuments();
  if (count > 0) {
    console.log(`• Accounts already exist (${count}), skipping starter account.`);
    return null;
  }
  const cash = await Account.create({
    name: "Cash",
    type: "cash",
    initialBalance: 0,
    currency: "INR",
    color: "#22C55E",
    icon: "wallet",
  });
  console.log("✓ Created starter 'Cash' account.");
  return cash;
}

async function seedDemoData() {
  if (!demo) return;
  const txnCount = await Transaction.countDocuments();
  if (txnCount > 0) {
    console.log(`• Transactions already exist (${txnCount}), skipping demo data.`);
    return;
  }

  const bank = await Account.create({
    name: "Bank Account",
    type: "bank",
    initialBalance: 50000,
    currency: "INR",
    color: "#3B82F6",
    icon: "landmark",
  });
  const cash = (await Account.findOne({ name: "Cash" })) ?? bank;

  const expenseCats = await Category.find({ type: "expense" });
  const incomeCats = await Category.find({ type: "income" });

  const now = new Date();
  const txns: Record<string, unknown>[] = [];

  // a few salary credits + many expenses across the last 60 days
  for (let monthBack = 0; monthBack < 2; monthBack++) {
    const d = new Date(now.getFullYear(), now.getMonth() - monthBack, 1);
    txns.push({
      type: "income",
      amount: 65000,
      account: bank._id,
      category: incomeCats.find((c) => c.name === "Salary")?._id ?? incomeCats[0]._id,
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
  await seedSettings();
  await seedCategories();
  await seedStarterAccount();
  await seedDemoData();
  await mongoose.disconnect();
  console.log("✓ Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
