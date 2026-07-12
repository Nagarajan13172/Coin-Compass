import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A saved "quick add" — a partially-filled transaction (type, account, category,
 * a default amount, note, tags) the user can log in one tap and just tweak the
 * price. Transfers aren't templated (they're rarely repetitive daily entries).
 */
const templateSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ["income", "expense"], default: "expense" },
    amount: { type: Number, default: 0, min: 0 }, // a starting price; 0 = ask each time
    account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    note: { type: String, default: "", trim: true },
    tags: { type: [String], default: [] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

templateSchema.index({ user: 1, order: 1, createdAt: 1 });

export type TemplateDoc = InferSchemaType<typeof templateSchema>;
export const Template = model("Template", templateSchema);
