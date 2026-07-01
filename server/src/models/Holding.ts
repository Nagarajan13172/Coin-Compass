import { Schema, model, type InferSchemaType } from "mongoose";

/** Top-level asset classes shown in the net-worth allocation. */
export const HOLDING_CLASSES = ["saving", "investment"] as const;

/** Saving subtypes + investment subtypes (physical assets map here too:
 *  jewellery → gold, house → real_estate). */
export const HOLDING_SUBTYPES = [
  "fixed_deposit",
  "recurring_deposit",
  "emergency_fund",
  "retirement_fund",
  "stocks",
  "mutual_funds",
  "real_estate",
  "bonds",
  "gold",
] as const;

/** An asset the user owns, valued at its current worth. */
const holdingSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    class: { type: String, enum: HOLDING_CLASSES, required: true },
    subtype: { type: String, enum: HOLDING_SUBTYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    provider: { type: String, default: "", trim: true },
    note: { type: String, default: "" },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

export type HoldingDoc = InferSchemaType<typeof holdingSchema>;
export const Holding = model("Holding", holdingSchema);
