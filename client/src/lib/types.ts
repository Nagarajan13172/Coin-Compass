export type TxnType = "income" | "expense" | "transfer";
export type CategoryType = "income" | "expense";
export type AccountType = "cash" | "bank" | "card" | "wallet" | "upi" | "savings";
export type BudgetPeriod = "weekly" | "monthly" | "yearly";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export type PeriodKey = "week" | "month" | "year";

export interface AccountStats {
  income: number;
  expense: number;
  transferIn: number;
  transferOut: number;
  balance: number;
  initialBalance: number;
}

export interface Account {
  _id: string;
  name: string;
  type: AccountType;
  initialBalance: number;
  currency: string;
  color: string;
  icon: string;
  includeInTotal: boolean;
  archived: boolean;
  order: number;
  balance?: number;
  stats?: AccountStats | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  _id: string;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  parent?: string | null;
  order: number;
  isDefault?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface RefLite {
  _id: string;
  name: string;
  color?: string;
  icon?: string;
  type?: string;
  currency?: string;
}

export interface Transaction {
  _id: string;
  type: TxnType;
  amount: number;
  account: RefLite | string;
  toAccount?: RefLite | string | null;
  category?: RefLite | string | null;
  date: string;
  note: string;
  payee: string;
  tags: string[];
  currency: string;
  /** Set when the transaction was auto-posted by a recurring rule. */
  recurring?: string | null;
  /** When set, this transaction is a repayment that reduces the loan's balance. */
  loan?: RefLite | string | null;
  /** When set, this transaction is the reflected side of a Credit entry (money to/from a person). */
  credit?: { _id: string; person: string; direction: CreditDirection } | string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TransactionPage {
  items: Transaction[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
}

export interface Budget {
  _id: string;
  category?: RefLite | null;
  amount: number;
  period: BudgetPeriod;
  startDate: string;
  rollover: boolean;
  currency: string;
  spent: number;
  remaining: number;
  percent: number;
  over: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Recurring {
  _id: string;
  type: TxnType;
  amount: number;
  account: RefLite;
  toAccount?: RefLite | null;
  category?: RefLite | null;
  note: string;
  payee: string;
  tags: string[];
  currency: string;
  loan?: RefLite | null;
  frequency: Frequency;
  interval: number;
  startDate: string;
  nextRun: string;
  endDate?: string | null;
  lastRun?: string | null;
  active: boolean;
  /** Next few scheduled run dates (ISO), computed server-side. */
  upcoming?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface Goal {
  _id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  targetDate?: string | null;
  monthlyContribution: number;
  color: string;
  icon: string;
  currency: string;
  achievedAt?: string | null;
  // computed server-side
  remaining: number;
  percent: number;
  complete: boolean;
  monthsLeft: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export type HoldingClass = "saving" | "investment";
export type HoldingSubtype =
  | "fixed_deposit"
  | "recurring_deposit"
  | "emergency_fund"
  | "retirement_fund"
  | "stocks"
  | "mutual_funds"
  | "real_estate"
  | "bonds"
  | "gold";

export interface Holding {
  _id: string;
  name: string;
  class: HoldingClass;
  subtype: HoldingSubtype;
  value: number;
  provider: string;
  note: string;
  currency: string;
  // Optional deposit/growth details (see holdingGrowth in lib/networth).
  investedAmount?: number | null;
  startDate?: string | null;
  maturityDate?: string | null;
  interestRate?: number | null;
  maturityValue?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export type LoanType = "home" | "personal" | "car" | "education" | "gold" | "business" | "other";
export type LoanStatus = "active" | "closed";

export interface Loan {
  _id: string;
  name: string;
  lender: string;
  type: LoanType;
  principal: number;
  outstanding: number;
  roi: number;
  emi: number;
  foreclosureChargePct: number;
  interestPaid: number;
  chargesPaid: number;
  /** Total tenure in months; endDate is derived from startDate + this. */
  tenureMonths?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  status: LoanStatus;
  note: string;
  currency: string;
  createdAt?: string;
  updatedAt?: string;
}

export type CreditDirection = "given" | "received";

/** Payment channels — how the money moved (the app/instrument), a record label
 *  distinct from the account whose balance actually changes. */
export const CREDIT_METHODS = [
  "Cash", "GPay", "PhonePe", "Paytm", "UPI", "Net Banking",
  "Debit Card", "Credit Card", "Cheque", "Bank Transfer", "Other",
] as const;
export type CreditMethod = (typeof CREDIT_METHODS)[number];

/** An informal IOU with a friend/family member; optionally linked to a real
 *  Transaction (see `reflected`) so it also moves an account balance. */
export interface Credit {
  _id: string;
  person: string;
  direction: CreditDirection;
  amount: number;
  date: string;
  /** How the money moved (GPay/PhonePe/…) — a label, not a balance. */
  method: string;
  /** The account whose balance moves — only set when reflected. */
  account?: RefLite | string | null;
  note: string;
  reflected: boolean;
  transaction?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/** One person's running ledger: net > 0 means they owe you, net < 0 means you owe them. */
export interface CreditPersonSummary {
  person: string;
  given: number;
  received: number;
  net: number;
  entries: Credit[];
}

export type Metal = "gold" | "silver";

export interface MetalPrice {
  metal: Metal;
  currency: string;
  date: string; // YYYY-MM-DD (IST)
  pricePerOunce: number;
  pricePerGram24k: number;
  pricePerGram22k: number;
  pricePerGram18k: number;
  prevClose: number;
  change: number;
  changePct: number;
  source: string;
  fetchedAt: string;
  // Actual GRT counter rate (gold only); 0 when unavailable → fall back to
  // spot + premium on the client.
  retail22k?: number;
  retail24k?: number;
  retail18k?: number;
  retailSource?: string;
}

export interface MetalsLatest {
  configured: boolean;
  gold: MetalPrice | null;
  silver: MetalPrice | null;
}

export type ViewMode = "user" | "superadmin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  emailVerified: boolean;
  /** ISO date the account was created (for "member since"). */
  createdAt: string | null;
  /** True for password accounts; false for OAuth-only sign-ins. */
  hasPassword: boolean;
  /** Whether two-factor authentication is enabled on this account. */
  twoFactorEnabled: boolean;
  /** Current view mode; `superadmin` may see the wealth (Net Worth) section. */
  mode: ViewMode;
  /** Whether the wealth lock is turned on for this account. */
  wealthLockEnabled: boolean;
}

/** The second factors offered at login. Backup codes are always accepted as a fallback. */
export type TwoFactorMethod = "totp" | "email" | "backup";

/**
 * Result of a password sign-in: either a full session (`user`) or a 2FA
 * challenge (`requires2fa`) that must be completed before a session is issued.
 */
export type LoginResult =
  | { requires2fa: false; user: AuthUser }
  | { requires2fa: true; methods: TwoFactorMethod[] };

/** The in-progress 2FA challenge, fetched by the verify screen from the pending cookie. */
export interface TwoFactorPending {
  email: string;
  methods: TwoFactorMethod[];
}

/** Current 2FA configuration for the signed-in account (Settings). */
export interface TwoFactorStatus {
  enabled: boolean;
  emailFallback: boolean;
  backupCodesRemaining: number;
}

/** Enrollment payload: what to show the user to scan/enter into their authenticator. */
export interface TwoFactorSetup {
  otpauthUrl: string;
  qrDataUrl: string;
  secret: string;
}

export interface OAuthProviders {
  google: boolean;
  github: boolean;
  microsoft: boolean;
  apple: boolean;
}

export interface ImportResult {
  total: number;
  imported: number;
  failed: { row: number; error: string }[];
  createdCategories: string[];
  createdAccounts: string[];
}

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  rateToBase: number;
}

export interface Settings {
  _id: string;
  name: string;
  description?: string;
  baseCurrency: string;
  theme: "light" | "dark" | "system";
  locale: string;
  language: "en" | "ta";
  firstDayOfWeek: number;
  monthStartDay: number;
  currencies: CurrencyConfig[];
  pinEnabled: boolean;
  emailReports: boolean;
  wealthLockEnabled: boolean;
}

export interface Summary {
  income: number;
  expense: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  netWorth: number;
  byCurrency: Record<string, number>;
  range: { start: string; end: string };
}

export interface NetWorthSnapshot {
  date: string; // YYYY-MM-DD (IST)
  netWorth: number;
  assets: number;
  liabilities: number;
  accountsTotal: number;
  holdingsTotal: number;
  saving: number;
  investment: number;
  currency: string;
}

export interface CategoryDatum {
  categoryId: string | null;
  name: string;
  color: string;
  icon: string;
  total: number;
  count: number;
  percent: number;
}

export interface TrendDatum {
  bucket: string;
  income: number;
  expense: number;
  net: number;
}

export interface AccountDatum {
  _id: string;
  name: string;
  color: string;
  income: number;
  expense: number;
}

export interface Dashboard {
  period: PeriodKey;
  range: { start: string; end: string };
  summary: Summary;
  accounts: Account[];
  byCategory: CategoryDatum[];
  trend: TrendDatum[];
  recent: Transaction[];
  budgets: (Budget & { spent: number; percent: number; over: boolean })[];
  upcoming: Recurring[];
}
