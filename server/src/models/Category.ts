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
    // Reporting-only rollup bucket ("food", "transport", "bills", …). Purely a
    // display dimension for the by-category charts: it creates no extra Category
    // documents, so the transaction picker and budgets keep seeing only real
    // leaf categories. null = ungrouped. Slugs come from a preset list on the
    // client (lib/categoryGroups.ts) but the field is a plain string so a custom
    // group degrades to showing its own text, same as a custom category name.
    group: { type: String, default: null, trim: true },
    order: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    // When true, picking this category in the transaction sheet auto-enables the
    // "one-off / irregular spend" toggle (e.g. a "Miscellaneous" bucket). The user
    // can still turn it off per transaction; this only sets the default.
    oneoffDefault: { type: Boolean, default: false },
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
