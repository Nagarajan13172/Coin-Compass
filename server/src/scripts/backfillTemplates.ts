/**
 * One-off backfill: give existing users the default quick-add templates that new
 * users now receive at signup (see provisionUser). Modelled on frequent daily
 * spends (tea/snacks, meals, fuel, groceries); each is matched to the user's
 * expense category of the same name and left account-less, so it falls back to
 * their first account when logged.
 *
 *   npm --prefix server run backfill:templates                       # every user
 *   npm --prefix server run backfill:templates -- --email you@x.com  # just one
 *
 * Idempotent: a template whose name the user already has is skipped (so a user's
 * own "Tea" is never duplicated), and new ones are appended after their existing
 * templates. Re-running is a no-op.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { createDefaultTemplates } from "../services/templateService";

function arg(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const eq = args.find((a) => a.startsWith(`${flag}=`));
  if (eq) return eq.slice(flag.length + 1);
  const i = args.indexOf(flag);
  const next = args[i + 1];
  if (i >= 0 && next && !next.startsWith("--")) return next;
  return undefined;
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
    const n = await createDefaultTemplates(u._id as mongoose.Types.ObjectId);
    total += n;
    if (n > 0) console.log(`✓ ${u.email}: added ${n} template${n === 1 ? "" : "s"}`);
  }

  await mongoose.disconnect();
  console.log(`\n✓ Done — ${total} template${total === 1 ? "" : "s"} added across ${users.length} user(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
