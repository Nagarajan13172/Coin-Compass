import i18n from "@/i18n";

/**
 * Translated display labels for values that are STORED in English (seeded category
 * names, fixed enum values). User-created categories and anything not in the map
 * fall back to the stored text unchanged, so nothing a user typed is ever mangled.
 *
 * These read the global i18n instance; call them from components that also use
 * useTranslation() so they re-render when the language changes.
 */

// Seeded category display name → stable key in the `categories` namespace.
// Keep in sync with server/src/seed/defaults.ts.
const CATEGORY_KEYS: Record<string, string> = {
  "Food & Dining": "food_dining",
  Groceries: "groceries",
  Transport: "transport",
  Shopping: "shopping",
  "Bills & Utilities": "bills_utilities",
  Rent: "rent",
  Entertainment: "entertainment",
  Health: "health",
  Education: "education",
  Travel: "travel",
  Fuel: "fuel",
  Subscriptions: "subscriptions",
  "Personal Care": "personal_care",
  "Gifts & Donations": "gifts_donations",
  "Parents Maintenance": "parents_maintenance",
  "Cash Withdrawal": "cash_withdrawal",
  Recharges: "recharges",
  "One-time Transfer": "one_time_transfer",
  "Personal Loan": "personal_loan",
  Maid: "maid",
  "Tea & Snacks": "tea_snacks",
  "Post-Office": "post_office",
  "Credit Given": "credit_given",
  Salary: "salary",
  Business: "business",
  Freelance: "freelance",
  Investments: "investments",
  Interest: "interest",
  Gifts: "gifts",
  Refunds: "refunds",
  "RD Returns": "rd_returns",
  "Existing Balance": "existing_balance",
  "Credit Received": "credit_received",
  Other: "other",
};

/** Display label for a category name — translated for seeded ones, verbatim for custom. */
export function categoryLabel(name: string | null | undefined): string {
  if (!name) return i18n.t("uncategorized", { ns: "common" });
  const key = CATEGORY_KEYS[name];
  return key ? i18n.t(key, { ns: "categories", defaultValue: name }) : name;
}

export type EnumKind = "account" | "loan" | "holdingClass" | "holding" | "method" | "frequency";

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Display label for a fixed enum value (account type, loan type, holding subtype,
 * credit method, recurring frequency). Falls back to the raw value if unmapped.
 */
export function enumLabel(kind: EnumKind, value: string | null | undefined): string {
  if (!value) return "";
  return i18n.t(`${kind}.${slug(value)}`, { ns: "enums", defaultValue: value });
}
