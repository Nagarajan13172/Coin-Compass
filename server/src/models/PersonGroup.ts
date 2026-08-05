import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A named set of people you regularly split with — "Flatmates", "Goa trip",
 * "Office lunch".
 *
 * Purely a shortcut: picking a group drops its members into a split as ordinary
 * participants, and they behave exactly as if you had typed each name. No
 * balance is ever held against a group, so removing someone from one (or
 * deleting it entirely) can never move money. That is deliberate — a group is a
 * convenience over People, not a second kind of ledger.
 */
const personGroupSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    // Normalised name, so "Flatmates" and "flatmates" can't both exist.
    key: { type: String, required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "Person" }],
  },
  { timestamps: true }
);

personGroupSchema.index({ user: 1, key: 1 }, { unique: true });

export type PersonGroupDoc = InferSchemaType<typeof personGroupSchema>;
export const PersonGroup = model("PersonGroup", personGroupSchema);
