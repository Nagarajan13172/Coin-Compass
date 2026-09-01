import { Schema, model, type InferSchemaType } from "mongoose";
import { FUND_KINDS } from "../services/navParse";

/**
 * A mutual-fund scheme, cached from AMFI's daily file. Global — scheme 122639 is
 * the same fund for everyone — so there is no `user` field and two users holding
 * it share one row (mirrors Instrument and MetalPrice).
 *
 * `schemeCode` is AMFI's identifier and the only thing lots reference. Plan and
 * option matter: "Direct/Growth" and "Regular/IDCW" of the same fund are separate
 * schemes with different NAVs, and picking the wrong one values a holding wrongly.
 */
const fundSchema = new Schema(
  {
    schemeCode: { type: String, required: true, unique: true, trim: true },
    isin: { type: String, default: "", trim: true },
    name: { type: String, required: true, trim: true },
    fundHouse: { type: String, default: "", trim: true },
    /** "Direct" | "Regular" | "" */
    plan: { type: String, default: "", trim: true },
    /** "Growth" | "IDCW" | "" */
    option: { type: String, default: "", trim: true },
    /** AMFI's own category heading, kept verbatim — the tax rules read it. */
    category: { type: String, default: "", trim: true },
    kind: { type: String, enum: FUND_KINDS, default: "other" },
    /** Latest published NAV and the day it belongs to (AMFI publishes T+1). */
    nav: { type: Number, default: 0, min: 0 },
    navDate: { type: Date, default: null },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Search runs over the name and house on every keystroke.
fundSchema.index({ name: "text", fundHouse: "text" });
fundSchema.index({ name: 1 });

export type FundDoc = InferSchemaType<typeof fundSchema>;
export const Fund = model("Fund", fundSchema);
