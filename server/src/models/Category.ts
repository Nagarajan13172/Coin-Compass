import { Schema, model, type InferSchemaType } from "mongoose";

export const CATEGORY_TYPES = ["income", "expense"] as const;

const categorySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: CATEGORY_TYPES, required: true },
    icon: { type: String, default: "tag" },
    color: { type: String, default: "#64748B" },
    parent: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    // Marks an auto-managed system category (currently the ones the Credits
    // feature tags its transactions with: "credit_given" / "credit_received").
    // null for ordinary user categories. Lets the app find/reuse the same bucket
    // even if the user renames its display name. See creditService.
    system: { type: String, default: null },
  },
  { timestamps: true }
);

export type CategoryDoc = InferSchemaType<typeof categorySchema>;
export const Category = model("Category", categorySchema);
