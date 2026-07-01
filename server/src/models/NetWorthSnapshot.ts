import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A daily snapshot of a user's net worth, in their base currency. One document
 * per (user, date) — the trend chart is built by accumulating these over time.
 *
 * There is no historical balance store in the app (holdings and loans are
 * point-in-time values), so we deliberately do NOT backfill: the trend starts
 * the day the user first opens Net Worth and grows from there. `date` is the
 * IST calendar day so a snapshot lines up with the user's day.
 */
const netWorthSnapshotSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true }, // YYYY-MM-DD in IST
    netWorth: { type: Number, required: true },
    assets: { type: Number, required: true },
    liabilities: { type: Number, required: true },
    // Breakdown of assets so the tooltip can explain a point without extra calls.
    accountsTotal: { type: Number, default: 0 },
    holdingsTotal: { type: Number, default: 0 },
    saving: { type: Number, default: 0 },
    investment: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
  },
  { timestamps: true }
);

// One snapshot per user per day; also the index used for history reads.
netWorthSnapshotSchema.index({ user: 1, date: -1 }, { unique: true });

export type NetWorthSnapshotDoc = InferSchemaType<typeof netWorthSnapshotSchema>;
export const NetWorthSnapshot = model("NetWorthSnapshot", netWorthSnapshotSchema);
