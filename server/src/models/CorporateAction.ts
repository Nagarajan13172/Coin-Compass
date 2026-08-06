import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A share split or bonus issue, as reported upstream. Global — a split is a fact
 * about the instrument, not about any one holder — so there is no `user` field.
 *
 * These matter because the market price adjusts the instant a split takes effect
 * but stored lots do not. IRCTC's 5:1 split would leave a ₹1,000 lot looking like
 * an 80% loss overnight. Splits and bonus issues are routine on Indian exchanges,
 * so a portfolio that ignores them goes quietly wrong rather than loudly.
 *
 * `ratio` is how many shares each old share became: 5 for a 5:1 split, 2 for a
 * 1:1 bonus. Applying it multiplies quantity and divides the buy price, which
 * leaves cost basis — and therefore the Stock Investments bucket — untouched.
 */
const corporateActionSchema = new Schema(
  {
    symbol: { type: String, required: true, trim: true },
    /** Effective (ex-) date, YYYY-MM-DD in IST. */
    date: { type: String, required: true },
    type: { type: String, enum: ["split"], default: "split" },
    ratio: { type: Number, required: true, min: 0 },
    /** As reported, e.g. "5:1" — kept so the UI can show the user's own language. */
    label: { type: String, default: "" },
    source: { type: String, default: "" },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

corporateActionSchema.index({ symbol: 1, date: -1 }, { unique: true });

export type CorporateActionDoc = InferSchemaType<typeof corporateActionSchema>;
export const CorporateAction = model("CorporateAction", corporateActionSchema);
