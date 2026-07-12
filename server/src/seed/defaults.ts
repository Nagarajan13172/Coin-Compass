export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Dining", icon: "utensils", color: "#F97316" },
  { name: "Groceries", icon: "shopping-cart", color: "#22C55E" },
  { name: "Transport", icon: "car", color: "#3B82F6" },
  { name: "Shopping", icon: "shopping-bag", color: "#EC4899" },
  { name: "Bills & Utilities", icon: "receipt", color: "#EAB308" },
  { name: "Rent", icon: "home", color: "#8B5CF6" },
  { name: "Entertainment", icon: "clapperboard", color: "#06B6D4" },
  { name: "Health", icon: "heart-pulse", color: "#EF4444" },
  { name: "Education", icon: "graduation-cap", color: "#0EA5E9" },
  { name: "Travel", icon: "plane", color: "#14B8A6" },
  { name: "Fuel", icon: "fuel", color: "#F59E0B" },
  { name: "Subscriptions", icon: "repeat", color: "#A855F7" },
  { name: "Personal Care", icon: "sparkles", color: "#D946EF" },
  { name: "Gifts & Donations", icon: "gift", color: "#FB7185" },
  { name: "Parents Maintenance", icon: "receipt", color: "#22C55E" },
  { name: "Cash Withdrawal", icon: "banknote", color: "#8B5CF6" },
  { name: "Recharges", icon: "gamepad", color: "#14B8A6" },
  { name: "One-time Transfer", icon: "plane", color: "#EC4899" },
  { name: "Personal Loan", icon: "credit-card", color: "#F97316" },
  { name: "Maid", icon: "pizza", color: "#64748B" },
  { name: "Tea & Snacks", icon: "coffee", color: "#22C55E" },
  { name: "Post-Office", icon: "receipt", color: "#EC4899" },
  // Auto-assigned by the Credits feature to money you lend / pay out to a person.
  { name: "Credit Given", icon: "hand-coins", color: "#F59E0B", system: "credit_given" },
  { name: "Other", icon: "ellipsis", color: "#64748B" },
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
  { name: "Salary", icon: "banknote", color: "#22C55E" },
  { name: "Business", icon: "briefcase", color: "#0EA5E9" },
  { name: "Freelance", icon: "laptop", color: "#8B5CF6" },
  { name: "Investments", icon: "trending-up", color: "#14B8A6" },
  { name: "Interest", icon: "percent", color: "#EAB308" },
  { name: "Gifts", icon: "gift", color: "#EC4899" },
  { name: "Refunds", icon: "rotate-ccw", color: "#3B82F6" },
  { name: "RD Returns", icon: "repeat", color: "#2563EB" },
  { name: "Existing Balance", icon: "piggy-bank", color: "#D946EF" },
  // Auto-assigned by the Credits feature to money a person pays back / gives you.
  { name: "Credit Received", icon: "coins", color: "#14B8A6", system: "credit_received" },
  { name: "Other", icon: "ellipsis", color: "#64748B" },
];
