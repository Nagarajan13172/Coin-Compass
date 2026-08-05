import type { Types } from "mongoose";
import { Person, type PersonRelation } from "../models/Person";
import { PersonGroup } from "../models/PersonGroup";
import { Credit } from "../models/Credit";
import { HttpError } from "../middleware/errorHandler";

/**
 * THE IDENTITY RULE, as a pure function: two typed names mean the same person
 * when they normalise to the same key.
 *
 *   personKey("Ravi")        === personKey("  ravi  ")     // case + edge spaces
 *   personKey("Ravi  Kumar") === personKey("Ravi Kumar")   // collapsed spacing
 *   personKey("Ravi")        !== personKey("Ravi Kumar")   // genuinely different
 *
 * Deliberately conservative. It fixes the typing slips a person makes on the
 * same name, and refuses to guess that "Ravi" and "Ravi Kumar" are one person —
 * that call belongs to the user, via merge, because getting it wrong silently
 * combines two people's balances.
 *
 * Whitespace collapsing is new: the old string grouping only did trim+lowercase,
 * so "Ravi  Kumar" (double space) was a separate ledger from "Ravi Kumar".
 */
export function personKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Reject a name that is blank once normalised (e.g. "   "). */
function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new HttpError(400, "Enter a name");
  return trimmed;
}

/**
 * Resolve a person reference to an id, creating the record when the name is new.
 *
 * Accepts either an existing person's id OR a typed name, which is what lets the
 * pickers send an id when one is chosen from the list and a name when the user
 * types someone new — and what lets every pre-existing API caller keep passing a
 * plain string. Returns null only when neither is supplied.
 */
export async function resolvePersonId(
  uid: unknown,
  ref: { personId?: string | null; name?: string | null }
): Promise<Types.ObjectId | null> {
  if (ref.personId) {
    const existing = await Person.findOne({ _id: ref.personId, user: uid }).select("_id").lean();
    if (!existing) throw new HttpError(404, "Person not found");
    return existing._id as Types.ObjectId;
  }
  if (!ref.name?.trim()) return null;

  const name = requireName(ref.name);
  const key = personKey(name);
  // Upsert rather than find-then-create: two split participants typed with the
  // same name in one request would otherwise race past the unique index.
  const doc = await Person.findOneAndUpdate(
    { user: uid, key },
    { $setOnInsert: { user: uid, key, name, relation: "other" } },
    { upsert: true, new: true }
  );
  return doc._id as Types.ObjectId;
}

// ─────────────────────────── groups ───────────────────────────

/**
 * Resolve the people a group should contain, accepting ids OR names so a group
 * can be built out of people who don't exist yet — the same find-or-create rule
 * the pickers rely on. Duplicates collapse, because a person can only be in a
 * group once.
 */
async function resolveMembers(
  uid: unknown,
  members: { personId?: string | null; name?: string | null }[]
): Promise<Types.ObjectId[]> {
  const ids: Types.ObjectId[] = [];
  const seen = new Set<string>();
  for (const m of members) {
    const id = await resolvePersonId(uid, m);
    if (!id || seen.has(String(id))) continue;
    seen.add(String(id));
    ids.push(id);
  }
  return ids;
}

export interface PersonGroupInput {
  name: string;
  members: { personId?: string | null; name?: string | null }[];
}

/** Every group, with its members populated for the pickers. */
export async function listGroups(uid: unknown) {
  return PersonGroup.find({ user: uid })
    .sort({ name: 1 })
    .populate({ path: "members", select: "name relation key" })
    .lean();
}

export async function createGroup(uid: unknown, data: PersonGroupInput) {
  const name = requireName(data.name);
  const key = personKey(name);
  if (await PersonGroup.findOne({ user: uid, key }).lean()) {
    throw new HttpError(409, "A group with this name already exists", "GROUP_EXISTS");
  }
  const members = await resolveMembers(uid, data.members ?? []);
  const created = await PersonGroup.create({ user: uid, name, key, members });
  return PersonGroup.findById(created._id).populate({ path: "members", select: "name relation key" }).lean();
}

export async function updateGroup(uid: unknown, groupId: unknown, patch: Partial<PersonGroupInput>) {
  const group = await PersonGroup.findOne({ _id: groupId, user: uid });
  if (!group) return null;

  if (patch.name !== undefined) {
    const name = requireName(patch.name);
    const key = personKey(name);
    const clash = await PersonGroup.findOne({ user: uid, key, _id: { $ne: group._id } }).lean();
    if (clash) throw new HttpError(409, "A group with this name already exists", "GROUP_EXISTS");
    group.name = name;
    group.key = key;
  }
  if (patch.members !== undefined) {
    group.members = (await resolveMembers(uid, patch.members)) as never;
  }
  await group.save();
  return PersonGroup.findById(group._id).populate({ path: "members", select: "name relation key" }).lean();
}

/** Delete a group. Never touches a person or a balance — see the model note. */
export async function deleteGroup(uid: unknown, groupId: unknown): Promise<boolean> {
  const res = await PersonGroup.deleteOne({ _id: groupId, user: uid });
  return res.deletedCount > 0;
}

/** Every person, with the name they'd be listed under. */
export async function listPeople(uid: unknown) {
  return Person.find({ user: uid }).sort({ name: 1 }).lean();
}

export interface PersonInput {
  name: string;
  relation?: PersonRelation;
}

export async function createPerson(uid: unknown, data: PersonInput) {
  const name = requireName(data.name);
  const key = personKey(name);
  const clash = await Person.findOne({ user: uid, key }).lean();
  if (clash) throw new HttpError(409, "Someone with this name already exists", "PERSON_EXISTS");
  return Person.create({ user: uid, name, key, relation: data.relation ?? "other" });
}

/**
 * Rename or re-tag a person. A rename that collides with someone else is refused
 * rather than silently merged — combining two ledgers has to be deliberate, so
 * the client is pointed at merge instead.
 */
export async function updatePerson(uid: unknown, personId: unknown, patch: Partial<PersonInput>) {
  const person = await Person.findOne({ _id: personId, user: uid });
  if (!person) return null;

  if (patch.name !== undefined) {
    const name = requireName(patch.name);
    const key = personKey(name);
    const clash = await Person.findOne({ user: uid, key, _id: { $ne: person._id } }).lean();
    if (clash) {
      throw new HttpError(409, "Someone with this name already exists", "PERSON_EXISTS");
    }
    person.name = name;
    person.key = key;
  }
  if (patch.relation !== undefined) person.relation = patch.relation;

  await person.save();
  return person;
}

/** How many credit entries still point at a person. */
export async function personEntryCount(uid: unknown, personId: unknown): Promise<number> {
  return Credit.countDocuments({ user: uid, personRef: personId });
}

/**
 * Delete a person. Refused while they still have entries unless `force` — the
 * same two-step the app uses for accounts and categories, so a delete can never
 * quietly orphan a balance. Forcing keeps the entries and the money they moved;
 * they simply fall back to the name snapshot stored on each credit.
 */
export async function deletePerson(uid: unknown, personId: unknown, force = false): Promise<boolean> {
  const person = await Person.findOne({ _id: personId, user: uid });
  if (!person) return false;

  const entries = await personEntryCount(uid, personId);
  if (entries > 0 && !force) {
    throw new HttpError(
      409,
      `${person.name} has ${entries} entr${entries === 1 ? "y" : "ies"}. Pass ?force=true to delete the person and keep them.`,
      "PERSON_IN_USE",
      { name: person.name, count: entries }
    );
  }
  if (entries > 0) await Credit.updateMany({ user: uid, personRef: personId }, { $set: { personRef: null } });
  // Drop them from any groups, so a picker can't offer a member who is gone.
  await PersonGroup.updateMany({ user: uid }, { $pull: { members: personId } });
  await Person.deleteOne({ _id: person._id, user: uid });
  return true;
}

/**
 * Fold `sourceId` into `targetId`: every entry is repointed and the source record
 * removed. This is the repair tool for the duplicates that free-text names left
 * behind ("Ravi" and "Ravi Kumar" being one person) — including any the backfill
 * created, since it can't safely guess those itself.
 *
 * Only the reference moves. No amount, date or transaction is touched, so a merge
 * never changes a balance — it only decides which ledger the balance belongs to.
 */
export async function mergePeople(uid: unknown, sourceId: unknown, targetId: unknown) {
  if (String(sourceId) === String(targetId)) {
    throw new HttpError(400, "Pick two different people to merge", "PERSON_MERGE_SAME");
  }
  const [source, target] = await Promise.all([
    Person.findOne({ _id: sourceId, user: uid }),
    Person.findOne({ _id: targetId, user: uid }),
  ]);
  if (!source || !target) throw new HttpError(404, "Person not found");

  const moved = await Credit.updateMany(
    { user: uid, personRef: source._id },
    { $set: { personRef: target._id, person: target.name } }
  );
  // Group membership follows the merge: the source is replaced by the target,
  // and $addToSet keeps a group that already had both from listing them twice.
  await PersonGroup.updateMany({ user: uid, members: source._id }, { $addToSet: { members: target._id } });
  await PersonGroup.updateMany({ user: uid }, { $pull: { members: source._id } });
  await Person.deleteOne({ _id: source._id, user: uid });
  return { merged: target.toObject(), movedEntries: moved.modifiedCount ?? 0 };
}
