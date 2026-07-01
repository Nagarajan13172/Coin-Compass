/**
 * One-off migration: assign all pre-auth (ownerless) data to a single user so the
 * existing single-user database keeps working after multi-user auth is introduced.
 *
 *   npm --prefix server run migrate:user -- you@example.com [password]
 *
 * If the user doesn't exist yet, a password must be supplied to create a login for them.
 * Idempotent: only documents that still lack an owner are updated.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { Budget } from "../models/Budget";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { Settings } from "../models/Settings";
import { hashPassword } from "../auth/password";

const ownerless = { $or: [{ user: { $exists: false } }, { user: null }] };

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const password = process.argv[3];
  if (!email) {
    console.error("Usage: migrate:user -- <email> [password]");
    process.exit(1);
  }

  await connectDB();

  let user = await User.findOne({ email });
  if (!user) {
    if (!password) {
      console.error(`No user "${email}" exists. Provide a password to create one:`);
      console.error(`  npm --prefix server run migrate:user -- ${email} <password>`);
      process.exit(1);
    }
    user = await User.create({
      email,
      name: email.split("@")[0],
      passwordHash: await hashPassword(password),
      emailVerified: true,
    });
    console.log(`✓ Created user ${email}`);
  } else {
    console.log(`• Using existing user ${email}`);
  }
  const userId = user._id;

  for (const [name, Model] of [
    ["accounts", Account],
    ["categories", Category],
    ["transactions", Transaction],
    ["budgets", Budget],
    ["recurring", RecurringTransaction],
  ] as const) {
    const res = await Model.updateMany(ownerless, { $set: { user: userId } });
    console.log(`  ${name}: assigned ${res.modifiedCount}`);
  }

  // Settings: attach the legacy singleton, or create a fresh one for this user.
  const userSettings = await Settings.findOne({ user: userId });
  const legacySettings = await Settings.findOne(ownerless);
  if (!userSettings && legacySettings) {
    legacySettings.set("user", userId);
    await legacySettings.save();
    console.log("  settings: attached legacy singleton");
  } else if (!userSettings) {
    await Settings.create({ user: userId });
    console.log("  settings: created fresh");
  } else {
    console.log("  settings: already present for user");
  }

  await mongoose.disconnect();
  console.log("✓ Migration complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
