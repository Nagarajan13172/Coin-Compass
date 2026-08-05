import { Schema, model, type InferSchemaType } from "mongoose";

export const PERSON_RELATIONS = ["family", "friend", "colleague", "other"] as const;
export type PersonRelation = (typeof PERSON_RELATIONS)[number];

/**
 * Someone you lend to, borrow from, or split bills with — a real record with an
 * id, rather than a name retyped on every entry.
 *
 * Before this existed, a credit stored the typed name and the ledger grouped by
 * `name.trim().toLowerCase()`. That merged "Ravi"/"ravi" but NOT "Ravi"/"Ravi
 * Kumar", so one person could silently become two half-balances. Credits and
 * split participants now point here instead (Credit.personRef), so identity is
 * decided once, at creation, and a rename updates every entry at once.
 *
 * `key` is the normalised name used for find-or-create and uniqueness — see
 * personKey() in personService for the exact rule.
 */
const personSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Normalised `name`, kept in sync on every write. Stored rather than computed
    // so the unique index below can enforce "one record per person, per user".
    key: { type: String, required: true },
    relation: { type: String, enum: PERSON_RELATIONS, default: "other" },
  },
  { timestamps: true }
);

// One record per normalised name per user — the database-level guarantee that
// find-or-create can't race two entries into existence for the same person.
personSchema.index({ user: 1, key: 1 }, { unique: true });

export type PersonDoc = InferSchemaType<typeof personSchema>;
export const Person = model("Person", personSchema);
