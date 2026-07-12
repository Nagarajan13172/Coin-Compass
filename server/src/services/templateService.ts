import { Types } from "mongoose";
import { Template } from "../models/Template";
import { Category } from "../models/Category";
import { Settings } from "../models/Settings";
import { DEFAULT_TEMPLATES } from "../seed/defaults";

/**
 * Create the default quick-add templates for a user, mapped to their expense
 * categories by name. Idempotent: templates whose name already exists are skipped
 * and new ones are appended after whatever the user already has. Returns how many
 * were created. Shared by provisioning, the backfill script, and the lazy seed.
 */
export async function createDefaultTemplates(uid: Types.ObjectId | string): Promise<number> {
  const user = new Types.ObjectId(String(uid));

  const existing = await Template.find({ user }).select("name").lean();
  const have = new Set(existing.map((t) => t.name));

  const cats = await Category.find({ user, type: "expense" }).select("name").lean();
  const catId = new Map(cats.map((c) => [c.name, c._id]));

  const toAdd = DEFAULT_TEMPLATES.filter((tpl) => !have.has(tpl.name)).map((tpl, i) => ({
    user,
    name: tpl.name,
    type: "expense" as const,
    amount: tpl.amount,
    category: catId.get(tpl.category) ?? null,
    note: tpl.note ?? "",
    order: existing.length + i,
  }));

  if (toAdd.length) await Template.insertMany(toAdd);
  return toAdd.length;
}

/**
 * Give pre-existing users (created before quick-add shipped) the default chips on
 * their first templates fetch — the "auto" part, so no manual backfill is needed
 * in production. Runs at most once per user: a guarded flag flip means only one
 * request seeds even under concurrency, and users who already have their own
 * templates (or deleted the defaults) are respected — the flag is set, nothing added.
 */
export async function ensureDefaultTemplatesSeeded(uid: Types.ObjectId | string): Promise<void> {
  // Atomically claim the one-time seed: only the request that flips the flag proceeds.
  const claimed = await Settings.findOneAndUpdate(
    { user: uid, templatesSeeded: { $ne: true } },
    { $set: { templatesSeeded: true } }
  );
  if (!claimed) return; // already seeded (or another request is doing it)

  const count = await Template.countDocuments({ user: uid });
  if (count === 0) await createDefaultTemplates(uid);
}
