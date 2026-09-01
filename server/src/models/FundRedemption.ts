import { Schema, model, type InferSchemaType } from "mongoose";
import { GAIN_TYPES } from "./StockSale";

/**
 * Which lots a redemption consumed, and at what cost — recorded rather than
 * recomputed, for the same reason StockSale records its allocations: undoing a
 * redemption must reverse exactly what it took, and re-running FIFO afterwards
 * drifts the moment any other lot has changed.
 */
const allocationSchema = new Schema(
  {
    lot: { type: Schema.Types.ObjectId, ref: "FundLot", required: true },
    units: { type: Number, required: true, min: 0 },
    /** Cost of exactly this slice: units × buyNav + the lot's pro-rata charges. */
    costBasis: { type: Number, required: true, min: 0 },
    buyDate: { type: Date, required: true },
    /**
     * Held over 12 months or not. Named for the equity rule it matches, and
     * accurate for equity schemes; debt and hybrid have their own periods, which
     * is why the fund's category travels with the redemption for the tax work.
     */
    gainType: { type: String, enum: GAIN_TYPES, required: true },
  },
  { _id: false }
);

/** One redemption of one scheme, allocated across the lots it consumed (FIFO). */
const fundRedemptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    fund: { type: Schema.Types.ObjectId, ref: "Fund", required: true },
    schemeCode: { type: String, required: true, trim: true },
    /** Where the proceeds landed. */
    account: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    units: { type: Number, required: true, min: 0 },
    sellNav: { type: Number, required: true, min: 0 },
    sellDate: { type: Date, required: true },
    /** Exit load and any charge deducted by the AMC. */
    fees: { type: Number, default: 0, min: 0 },
    note: { type: String, default: "", trim: true },
    currency: { type: String, default: "INR" },
    allocations: { type: [allocationSchema], default: [] },
    /** proceeds − allocated cost basis − charges. Negative on a loss. */
    realizedPL: { type: Number, default: 0 },
    /** The ledger transfer (Securities → receiving account) for the proceeds. */
    sellTransaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
  },
  { timestamps: true }
);

fundRedemptionSchema.index({ user: 1, sellDate: -1 });

export type FundRedemptionDoc = InferSchemaType<typeof fundRedemptionSchema>;
export const FundRedemption = model("FundRedemption", fundRedemptionSchema);
