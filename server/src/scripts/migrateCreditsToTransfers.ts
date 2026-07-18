/**
 * One-off migration: convert reflected Credits from the OLD model (a "given" =
 * expense, a "received" = income) to the NEW neutralizing model (a transfer
 * between the user's real account and an auto-managed "Money Lent" account, plus
 * an income leg only for money received BEYOND what a person owed).
 *
 *   npm --prefix server run migrate:credits -- --dry-run   # preview, no writes
 *   npm --prefix server run migrate:credits                # apply
 *
 * WHY: lending/repaying is a balance-sheet move, not income/expense. The old
 * model inflated both. After this, repayments neutralize and never touch income.
 *
 * SAFE / IDEMPOTENT:
 *  - Only converts a credit whose primary transaction is CURRENTLY income/expense
 *    (the genuine old model). Already-transfer / already-income-only credits are
 *    recognised and skipped, so re-running is a clean no-op.
 *  - A credit flagged `reflected` but with NO posted transaction is LEFT UNTOUCHED
 *    and reported — the migration never invents a balance movement that didn't
 *    exist before (so it can't silently yank money out of an account).
 *  - Per user, per person, ALL entries are replayed OLDEST→NEWEST so the
 *    overpayment split (neutral vs income) matches what live creates going forward.
 */
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Credit } from "../models/Credit";
import { Transaction } from "../models/Transaction";
import { ensureLentAccount, ensureCreditCategoryId, splitRepayment } from "../services/creditService";

export interface CreditMigrationSummary {
  converted: number;
  incomeLegs: number;
  alreadyNew: number;
  stray: string[];
}

/**
 * Convert reflected credits to the neutralizing transfer model, in place, on the
 * current mongoose connection. Free of process concerns (connect/exit) so it can
 * be unit-tested against an in-memory DB. Idempotent.
 */
export async function migrateCredits(dryRun: boolean): Promise<CreditMigrationSummary> {
  // EVERY credit per (user, person), oldest first — so `owed` matches live
  // personOutstanding (which counts all entries, reflected or not).
  const credits = await Credit.find({}).sort({ date: 1, createdAt: 1 }).lean();
  const groups = new Map<string, typeof credits>();
  for (const c of credits) {
    const key = `${c.user}::${c.person.trim().toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  let converted = 0;
  let incomeLegs = 0;
  let alreadyNew = 0;
  const stray: string[] = []; // reflected but never posted a transaction

  for (const [, entries] of groups) {
    let owed = 0; // running: what this person owes the user, BEFORE the current entry
    for (const c of entries) {
      const uid = c.user;
      const primaryTxn =
        c.reflected && c.transaction ? await Transaction.findOne({ _id: c.transaction, user: uid }) : null;
      const incomeTxn =
        c.reflected && c.incomeTransaction ? await Transaction.findOne({ _id: c.incomeTransaction, user: uid }) : null;
      // Already on the new model: primary is a transfer, OR a "received" that was
      // pure income (no dues owed) whose only leg is the income one.
      const alreadyMigrated =
        primaryTxn?.type === "transfer" ||
        (!primaryTxn && c.direction === "received" && incomeTxn?.type === "income");
      const isOldModel =
        c.reflected && Boolean(c.account) && (primaryTxn?.type === "income" || primaryTxn?.type === "expense");

      if (!c.reflected) {
        // pure ledger IOU — no transaction to convert
      } else if (alreadyMigrated) {
        alreadyNew++;
      } else if (!isOldModel) {
        // reflected flag with no (income/expense) transaction behind it — leave it
        stray.push(`${c.person} ${c.direction} ₹${c.amount}`);
      } else {
        const { neutral, income } =
          c.direction === "given" ? { neutral: c.amount, income: 0 } : splitRepayment(owed, c.amount);

        if (dryRun) {
          const rhs =
            c.direction === "given"
              ? "transfer (Bank → Money Lent)"
              : `transfer ${neutral}` + (income > 0 ? ` + income ${income}` : "") + `  (owed ${owed})`;
          console.log(`  ${c.direction.padEnd(8)} ${c.person} ₹${c.amount}: ${primaryTxn!.type} → ${rhs}`);
        } else {
          const lent = await ensureLentAccount(uid);
          const oldIds = [c.transaction, c.incomeTransaction].filter(Boolean);
          if (oldIds.length) await Transaction.deleteMany({ _id: { $in: oldIds }, user: uid });

          const base = {
            user: uid,
            date: c.date,
            note: c.note || (c.direction === "given" ? `Given to ${c.person}` : `Received from ${c.person}`),
            payee: c.person,
            credit: c._id,
          };
          let primary: mongoose.Types.ObjectId | null = null;
          let incomeTxnId: mongoose.Types.ObjectId | null = null;

          if (c.direction === "given") {
            const t = await Transaction.create({ ...base, type: "transfer", amount: c.amount, account: c.account, toAccount: lent, category: null });
            primary = t._id;
          } else {
            if (neutral > 0) {
              const t = await Transaction.create({ ...base, type: "transfer", amount: neutral, account: lent, toAccount: c.account, category: null });
              primary = t._id;
            }
            if (income > 0) {
              const category = await ensureCreditCategoryId(uid, "received");
              const t = await Transaction.create({ ...base, type: "income", amount: income, account: c.account, toAccount: null, category });
              incomeTxnId = t._id;
            }
          }
          await Credit.updateOne({ _id: c._id }, { $set: { transaction: primary, incomeTransaction: incomeTxnId } });
        }
        converted++;
        if (income > 0) incomeLegs++;
      }

      owed += c.direction === "given" ? c.amount : -c.amount;
    }
  }

  return { converted, incomeLegs, alreadyNew, stray };
}

const hasFlag = (f: string) => process.argv.slice(2).includes(f);

async function main() {
  const dryRun = hasFlag("--dry-run");
  await connectDB();
  const { converted, incomeLegs, alreadyNew, stray } = await migrateCredits(dryRun);

  console.log(
    `\n${dryRun ? "[DRY RUN] would convert" : "Converted"}: ${converted} old-model credit(s), ` +
      `${incomeLegs} overpayment-income leg(s); already-new ${alreadyNew}.`
  );
  if (stray.length) {
    console.log(
      `\n⚠ ${stray.length} credit(s) are flagged reflected but never posted a transaction — ` +
        `LEFT UNTOUCHED (they don't affect balances today):`
    );
    stray.forEach((s) => console.log(`   • ${s}`));
    console.log(`   Re-save each in the Credits UI (toggle reflect off then on) if you want it to post now.`);
  }

  await mongoose.disconnect();
  process.exit(0);
}

// Run as a CLI only when invoked directly — importing the module (e.g. from a
// test) must NOT connect to a DB or exit the process.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error("Credit migration failed:", err);
    process.exit(1);
  });
}
