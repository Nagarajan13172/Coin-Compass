import { Schema, model, type InferSchemaType } from "mongoose";

export const METALS = ["gold", "silver"] as const;
export type Metal = (typeof METALS)[number];

/**
 * A daily snapshot of a precious-metal rate (gold/silver), in INR. These are
 * global — the market rate is the same for every user — so there is no `user`
 * field. One document per (metal, date); the history chart is built by
 * accumulating these snapshots over time. Prices are per gram at the given
 * purity (24k/22k/18k) plus the per-troy-ounce spot price.
 */
const metalPriceSchema = new Schema(
  {
    metal: { type: String, enum: METALS, required: true },
    currency: { type: String, default: "INR" },
    date: { type: String, required: true }, // YYYY-MM-DD in IST
    pricePerOunce: { type: Number, required: true },
    pricePerGram24k: { type: Number, required: true },
    pricePerGram22k: { type: Number, default: 0 },
    pricePerGram18k: { type: Number, default: 0 },
    prevClose: { type: Number, default: 0 },
    change: { type: Number, default: 0 }, // absolute change in ounce price vs prev close
    changePct: { type: Number, default: 0 },
    source: { type: String, default: "goldapi.io" },
    fetchedAt: { type: Date, default: Date.now },
    // Actual local retail rate (GRT Jewellers), scraped daily. Gold only; 0 when
    // the scrape failed and the client should fall back to the spot + premium.
    retail22k: { type: Number, default: 0 },
    retail24k: { type: Number, default: 0 },
    retail18k: { type: Number, default: 0 },
    retailSource: { type: String, default: "" },
  },
  { timestamps: true }
);

// One snapshot per metal per day; also the index used for "latest" + history.
metalPriceSchema.index({ metal: 1, date: -1 }, { unique: true });

export type MetalPriceDoc = InferSchemaType<typeof metalPriceSchema>;
export const MetalPrice = model("MetalPrice", metalPriceSchema);
