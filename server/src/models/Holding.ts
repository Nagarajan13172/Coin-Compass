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
    // Optional deposit/growth details (FDs, RDs, bonds, …). `value` above remains
    // the authoritative net-worth figure; these describe how it grows so the app
    // can show gain, return % and a projected "worth today". All nullable — a bare
    // holding (name + value) works exactly as before.
    investedAmount: { type: Number, default: null, min: 0 }, // what you put in (cost basis)
    startDate: { type: Date, default: null },
    maturityDate: { type: Date, default: null },
    interestRate: { type: Number, default: null, min: 0 }, // annual % (effective)
    maturityValue: { type: Number, default: null, min: 0 }, // expected payout at maturity
    // A recurring deposit runs for a fixed number of instalments — a 12-month RD
    // is 12 payments, not "until you remember to stop it". The count is what the
    // user agreed with the bank, so it drives both the progress bar and the
    // schedule's end date rather than being derived from a date they'd have to
    // work out themselves.
    termCount: { type: Number, default: null, min: 1, max: 600 },
    // Where the maturity payout lands. Chosen up front, when the deposit is set
    // up, so the money has somewhere to go without a decision at the end.
    payoutAccount: { type: Schema.Types.ObjectId, ref: "Account", default: null },
  },
  { timestamps: true }
);

export type HoldingDoc = InferSchemaType<typeof holdingSchema>;
export const Holding = model("Holding", holdingSchema);
