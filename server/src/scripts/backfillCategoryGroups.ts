/**
 * One-off backfill: assign each existing category a reporting `group` so the
 * by-category charts can fold ~30 flat rows into ~10 readable buckets. Workspaces
 * created before Category.group existed have it null everywhere, which would make
 * the grouped view one giant "Ungrouped" slice.
 *
 *   npm --prefix server run backfill:category-groups                       # every user
 *   npm --prefix server run backfill:category-groups -- --email you@x.com  # just one
 *   npm --prefix server run backfill:category-groups -- --dry              # preview only
 *
 * Only touches Category.group, and only where it is currently unset — no
 * transaction is rewritten and a manually chosen group is never clobbered, so
 * re-running is a no-op. Categories whose name isn't in the map below are left
 * ungrouped and listed at the end so they can be assigned in the UI.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Category } from "../models/Category";

/**
 * Category name → group slug, matched case-insensitively. Covers the seeded
 * defaults (kept in sync with seed/defaults.ts) plus the common hand-made
 * categories seen in real workspaces. Names not listed here stay ungrouped
 * rather than being guessed into the wrong bucket.
 */
const GROUP_BY_NAME: Record<string, string> = {
  // — expense —
  "food & dining": "food",
  groceries: "food",
  "tea & snacks": "food",
  restaurants: "food",

  transport: "transport",
  travel: "transport",
  fuel: "transport",
  "car wash": "transport",
  parking: "transport",

  rent: "home",
  maid: "home",
  "cleaning bathroom": "home",
  household: "home",
  repairs: "home",

  "bills & utilities": "bills",
  subscriptions: "bills",
  recharges: "bills",
  insurance: "bills",
  "home loan insurance": "bills",
  internet: "bills",
  electricity: "bills",

  health: "health",
  medicine: "health",
  medical: "health",
  pharmacy: "health",

  education: "education",
  book: "education",
  books: "education",
  courses: "education",

  shopping: "lifestyle",
  entertainment: "lifestyle",
  "personal care": "lifestyle",
  clothing: "lifestyle",

  "gifts & donations": "family_giving",
  "parents maintenance": "family_giving",
  family: "family_giving",
  donations: "family_giving",

  deposits: "savings",
  "post-office": "savings",
  "post office": "savings",
  savings: "savings",
  investment: "savings",
  rd: "savings",
  "tour rd": "savings",

  "personal loan": "debt_transfers",
  "cash withdrawal": "debt_transfers",
  "one-time transfer": "debt_transfers",
  "amazon pay": "debt_transfers",
  "credit given": "debt_transfers",
  emi: "debt_transfers",
  "home loan": "debt_transfers",
  "loan repayment": "debt_transfers",

  misc: "other",
  miscellaneous: "other",

  // — income —
  salary: "earnings",
  business: "earnings",
  freelance: "earnings",

  investments: "returns",
  interest: "returns",
  "rd returns": "returns",

  gifts: "inflows",
  refunds: "inflows",
  "existing balance": "inflows",
  "credit received": "inflows",
};

/**
 * "Other" is seeded for BOTH types and is the one name whose bucket depends on
 * type — everything else is unambiguous. Resolved here rather than in the map.
 */
function groupFor(name: string): string | undefined {
  return GROUP_BY_NAME[name.trim().toLowerCase()] ?? (name.trim().toLowerCase() === "other" ? "other" : undefined);
}

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

  const dry = process.argv.includes("--dry");
  const email = (arg("--email") ?? "").toLowerCase().trim();
  const users = email ? await User.find({ email }) : await User.find({});
  if (email && users.length === 0) {
    console.error(`No user "${email}".`);
    process.exit(1);
  }

  let updated = 0;
  const unmatched: string[] = [];

  for (const u of users) {
    // `$in: [null, ""]` also catches the pre-migration docs that have no `group`
    // key at all — Mongo treats a missing field as null for this comparison.
    const pending = await Category.find({ user: u._id, group: { $in: [null, ""] } });
    if (pending.length === 0) continue;

    const ops = [];
    for (const c of pending) {
      const group = groupFor(c.name);
      if (!group) {
        unmatched.push(`${u.email}: ${c.name} (${c.type})`);
        continue;
      }
      ops.push({ updateOne: { filter: { _id: c._id }, update: { $set: { group } } } });
    }

    if (ops.length > 0 && !dry) await Category.bulkWrite(ops);
    updated += ops.length;
    console.log(`${dry ? "·" : "✓"} ${u.email}: ${ops.length} of ${pending.length} ungrouped categories mapped`);
  }

  if (unmatched.length > 0) {
    console.log(`\n${unmatched.length} category(s) left ungrouped — assign these in Settings → Categories:`);
    for (const n of unmatched) console.log(`  - ${n}`);
  }

  await mongoose.disconnect();
  console.log(
    `\n${dry ? "Dry run — nothing written." : "✓ Done"} — ${updated} category(s) ${dry ? "would be grouped" : "grouped"} across ${users.length} user(s).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
