/**
 * One-off backfill: turn the free-text names on existing credits into real
 * Person records, and point each credit at the one it belongs to.
 *
 *   npm --prefix server run backfill:people                       # every user
 *   npm --prefix server run backfill:people -- --email you@x.com  # just one
 *   npm --prefix server run backfill:people -- --dry              # preview only
 *
 * Non-destructive by design:
 *   • `Credit.person` (the name as typed) is never modified — it stays as a
 *     historical snapshot, so a bad run can be re-done from the original data.
 *   • Only `Credit.personRef` is written, and only where it is currently unset,
 *     so re-running is a no-op and a person chosen by hand is never clobbered.
 *
 * People are grouped by personKey() — the SAME rule the live app uses — so the
 * backfill can't disagree with what the Credits page already shows.
 *
 * It deliberately does NOT merge "Ravi" with "Ravi Kumar". Those may or may not
 * be one person and only the user knows; guessing would silently combine two
 * balances. Instead, likely duplicates are printed at the end to be merged in
 * Settings → People.
 */
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Credit } from "../models/Credit";
import { Person } from "../models/Person";
import { personKey } from "../services/personService";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const emailIdx = args.indexOf("--email");
const onlyEmail = emailIdx >= 0 ? args[emailIdx + 1] : null;

/**
 * Names that look like they might be the same person: one key is a prefix of the
 * other at a word boundary ("ravi" vs "ravi kumar"). Reported, never acted on.
 */
function likelyDuplicates(keys: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  const sorted = [...keys].sort();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].startsWith(`${sorted[i]} `)) pairs.push([sorted[i], sorted[j]]);
    }
  }
  return pairs;
}

async function main() {
  await connectDB();

  const users = await User.find(onlyEmail ? { email: onlyEmail } : {}).select("_id email").lean();
  if (!users.length) {
    console.log(onlyEmail ? `No user with email ${onlyEmail}` : "No users found");
    return;
  }
  console.log(`${dry ? "[dry run] " : ""}Backfilling people for ${users.length} user(s)\n`);

  let totalPeople = 0;
  let totalLinked = 0;

  for (const user of users) {
    const credits = await Credit.find({ user: user._id }).select("person personRef").lean();
    if (!credits.length) continue;

    // Distinct names, keyed the way the live app groups them. The first spelling
    // seen wins as the display name — it's the one already on screen today.
    const nameByKey = new Map<string, string>();
    for (const c of credits) {
      const key = personKey(c.person);
      if (key && !nameByKey.has(key)) nameByKey.set(key, c.person.trim());
    }

    let created = 0;
    let linked = 0;
    const idByKey = new Map<string, mongoose.Types.ObjectId>();
    // Keys that will exist once this run finishes. Tracked separately from
    // `idByKey` because a dry run has no ids for records it didn't create — and
    // counting links off the ids alone would report 0 and understate the preview.
    const knownKeys = new Set<string>();

    for (const [key, name] of nameByKey) {
      const existing = await Person.findOne({ user: user._id, key }).select("_id").lean();
      knownKeys.add(key);
      if (existing) {
        idByKey.set(key, existing._id as mongoose.Types.ObjectId);
        continue;
      }
      created++;
      if (dry) continue;
      const doc = await Person.create({ user: user._id, name, key, relation: "other" });
      idByKey.set(key, doc._id as mongoose.Types.ObjectId);
    }

    // Link only the entries that don't already have a person.
    for (const c of credits) {
      if (c.personRef) continue;
      const key = personKey(c.person);
      if (!knownKeys.has(key)) continue;
      linked++;
      if (dry) continue;
      const id = idByKey.get(key);
      if (id) await Credit.updateOne({ _id: c._id }, { $set: { personRef: id } });
    }

    totalPeople += created;
    totalLinked += linked;
    console.log(`${user.email}: ${created} person record(s), ${linked} entr(ies) linked`);

    const dupes = likelyDuplicates([...nameByKey.keys()]);
    for (const [a, b] of dupes) {
      console.log(`   ⚠ possibly the same person: "${nameByKey.get(a)}" / "${nameByKey.get(b)}" — merge in Settings → People if so`);
    }
  }

  console.log(
    `\n${dry ? "[dry run] would create" : "Created"} ${totalPeople} person record(s) and link ${totalLinked} entr(ies).`
  );
  if (dry) console.log("Nothing was written. Re-run without --dry to apply.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
