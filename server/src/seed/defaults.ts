// `group` is the reporting rollup bucket (see Category.group). It only affects how
// the by-category charts fold rows together — every category below is still a real,
// independently selectable category. Keep the slugs in sync with GROUP_META in
// client/src/lib/categoryGroups.ts and the catalogs in i18n/locales/*/categoryGroups.json.
export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Dining", icon: "utensils", color: "#F97316", group: "food" },
  { name: "Groceries", icon: "shopping-cart", color: "#22C55E", group: "food" },
  { name: "Transport", icon: "car", color: "#3B82F6", group: "transport" },
  { name: "Shopping", icon: "shopping-bag", color: "#EC4899", group: "lifestyle" },
  { name: "Bills & Utilities", icon: "receipt", color: "#EAB308", group: "bills" },
  { name: "Rent", icon: "home", color: "#8B5CF6", group: "home" },
  { name: "Entertainment", icon: "clapperboard", color: "#06B6D4", group: "lifestyle" },
  { name: "Health", icon: "heart-pulse", color: "#EF4444", group: "health" },
  { name: "Education", icon: "graduation-cap", color: "#0EA5E9", group: "education" },
  { name: "Travel", icon: "plane", color: "#14B8A6", group: "transport" },
  { name: "Fuel", icon: "fuel", color: "#F59E0B", group: "transport" },
  { name: "Subscriptions", icon: "repeat", color: "#A855F7", group: "bills" },
  { name: "Personal Care", icon: "sparkles", color: "#D946EF", group: "lifestyle" },
  { name: "Gifts & Donations", icon: "gift", color: "#FB7185", group: "family_giving" },
  { name: "Parents Maintenance", icon: "receipt", color: "#22C55E", group: "family_giving" },
  { name: "Cash Withdrawal", icon: "banknote", color: "#8B5CF6", group: "debt_transfers" },
  { name: "Recharges", icon: "gamepad", color: "#14B8A6", group: "bills" },
  { name: "One-time Transfer", icon: "plane", color: "#EC4899", group: "debt_transfers" },
  { name: "Personal Loan", icon: "credit-card", color: "#F97316", group: "debt_transfers" },
  { name: "Maid", icon: "pizza", color: "#64748B", group: "home" },
  { name: "Tea & Snacks", icon: "coffee", color: "#22C55E", group: "food" },
  { name: "Post-Office", icon: "receipt", color: "#EC4899", group: "savings" },
  // Auto-assigned by the Credits feature to money you lend / pay out to a person.
  { name: "Credit Given", icon: "hand-coins", color: "#F59E0B", system: "credit_given", group: "debt_transfers" },
  { name: "Other", icon: "ellipsis", color: "#64748B", group: "other" },
];

/**
 * Starter "quick add" templates every new workspace gets, so the one-tap chips on
 * the Transactions page are useful from day one. Modelled on the most frequent
 * daily spends (tea/snacks, meals, fuel, groceries). `category` is matched to a
 * default expense category by name at provisioning time; `account` is left unset
 * so it falls back to the user's first account when logged.
 */
export const DEFAULT_TEMPLATES = [
  { name: "Tea & Snacks", amount: 150, category: "Tea & Snacks" },
  { name: "Breakfast", amount: 200, category: "Food & Dining", note: "Breakfast" },
  { name: "Lunch", amount: 300, category: "Food & Dining", note: "Lunch" },
  { name: "Fuel", amount: 1000, category: "Fuel" },
  { name: "Groceries", amount: 500, category: "Groceries" },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary", icon: "banknote", color: "#22C55E", group: "earnings" },
  { name: "Business", icon: "briefcase", color: "#0EA5E9", group: "earnings" },
  { name: "Freelance", icon: "laptop", color: "#8B5CF6", group: "earnings" },
  { name: "Investments", icon: "trending-up", color: "#14B8A6", group: "returns" },
  { name: "Interest", icon: "percent", color: "#EAB308", group: "returns" },
  { name: "Gifts", icon: "gift", color: "#EC4899", group: "inflows" },
  { name: "Refunds", icon: "rotate-ccw", color: "#3B82F6", group: "inflows" },
  { name: "RD Returns", icon: "repeat", color: "#2563EB", group: "returns" },
  { name: "Existing Balance", icon: "piggy-bank", color: "#D946EF", group: "inflows" },
  // Auto-assigned by the Credits feature to money a person pays back / gives you.
  { name: "Credit Received", icon: "coins", color: "#14B8A6", system: "credit_received", group: "inflows" },
  { name: "Other", icon: "ellipsis", color: "#64748B", group: "other" },
];
