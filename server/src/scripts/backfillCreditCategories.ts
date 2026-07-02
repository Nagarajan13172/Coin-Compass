/**
 * One-off backfill: file existing credit-linked transactions under the auto
 * "Credit Given" / "Credit Received" categories. Older reflected credits were
 * created with `category: null`, so they show up uncategorized in reports — this
 * assigns them the same category new credits now get automatically.
 *
 *   npm --prefix server run backfill:credit-categories                       # every user
 *   npm --prefix server run backfill:credit-categories -- --email you@x.com  # just one
 *
 * Idempotent: only transactions that are credit-linked AND still uncategorized
 * are touched, so re-running is a no-op. Direction is inferred from the
 * transaction type (given → expense, received → income), matching how the
 * Credits feature creates them.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Transaction } from "../models/Transaction";
import { ensureCreditCategoryId } from "../services/creditService";

function arg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = args.indexOf(flag);
  const next = args[i + 1];
  if (i >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
}

async function backfillUser(uid: mongoose.Types.ObjectId): Promise<number> {
  const givenCat = await ensureCreditCategoryId(uid, "given");
  const receivedCat = await ensureCreditCategoryId(uid, "received");

  const base = { user: uid, credit: { $ne: null }, category: null } as const;
  const expense = await Transaction.updateMany({ ...base, type: "expense" }, { category: givenCat });
  const income = await Transaction.updateMany({ ...base, type: "income" }, { category: receivedCat });
  return (expense.modifiedCount ?? 0) + (income.modifiedCount ?? 0);
}

async function main() {
  await connectDB();

  const email = (arg("--email") ?? "").toLowerCase().trim();
  const users = email ? await User.find({ email }) : await User.find({});
  if (email && users.length === 0) {
    console.error(`No user "${email}".`);
    process.exit(1);
  }

  let total = 0;
  for (const u of users) {
    const n = await backfillUser(u._id as mongoose.Types.ObjectId);
    total += n;
    if (n > 0) console.log(`✓ ${u.email}: categorized ${n} credit transaction${n === 1 ? "" : "s"}`);
  }

  await mongoose.disconnect();
  console.log(`\n✓ Done — ${total} transaction${total === 1 ? "" : "s"} updated across ${users.length} user(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
