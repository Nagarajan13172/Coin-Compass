export type TxnType = "income" | "expense" | "transfer";
export type CategoryType = "income" | "expense";
export type AccountType = "cash" | "bank" | "card" | "wallet" | "savings";
export type BudgetPeriod = "weekly" | "monthly" | "yearly";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";
export type PeriodKey = "week" | "month" | "year";

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
  createdAt?: string;
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
  createdAt?: string;
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
  frequency: Frequency;
  interval: number;
  startDate: string;
  nextRun: string;
  endDate?: string | null;
  lastRun?: string | null;
  active: boolean;
  /** Next few scheduled run dates (ISO), computed server-side. */
  upcoming?: string[];
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string;
  emailVerified: boolean;
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
  baseCurrency: string;
  theme: "light" | "dark" | "system";
  locale: string;
  firstDayOfWeek: number;
  monthStartDay: number;
  currencies: CurrencyConfig[];
  pinEnabled: boolean;
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
