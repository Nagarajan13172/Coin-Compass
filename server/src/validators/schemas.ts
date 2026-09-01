import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const optionalObjectId = objectId.nullish();

export const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
  name: z.string().max(80).optional(),
});

export const signinSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
  remember: z.boolean().optional().default(true),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Missing verification token").max(400),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(200),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, "Missing reset token").max(400),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").max(200),
});

// ---- Two-factor authentication ----
// TOTP/email codes are 6 digits; backup codes are "xxxx-xxxx". The login-verify
// schema accepts any of them and tags which method the client used.
export const enable2faSchema = z.object({
  code: z.string().trim().min(6).max(10),
});

export const verify2faSchema = z.object({
  method: z.enum(["totp", "email", "backup"]),
  code: z.string().trim().min(6).max(20),
});

export const disable2faSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  code: z.string().trim().max(20).optional(),
});

export const regenerateBackupCodesSchema = z.object({
  code: z.string().trim().min(6).max(20),
});

export const emailFallbackSchema = z.object({
  enabled: z.boolean(),
});

// Resetting a forgotten Net Worth passcode with the emailed code. `passcode` is
// only length-capped here; the 4-32 rule lives in the service so a too-short
// passcode gets the same friendly message as when setting one normally.
export const wealthPasscodeResetSchema = z.object({
  code: z.string().trim().min(4).max(10),
  passcode: z.string().max(200),
});

export const accountSchema = z.object({
  name: z.string().min(1).max(60),
  // "receivable"/"payable"/"securities" are auto-managed and deliberately absent:
  // the user creates a demat account by hand, but never a system bucket.
  type: z.enum(["cash", "bank", "card", "wallet", "upi", "savings", "demat"]).default("cash"),
  initialBalance: z.number().default(0),
  currency: z.string().default("INR"),
  color: z.string().default("#2563EB"),
  icon: z.string().default("wallet"),
  includeInTotal: z.boolean().default(true),
  archived: z.boolean().default(false),
  order: z.number().default(0),
});
export const accountUpdateSchema = accountSchema.partial();

export const categorySchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["income", "expense"]),
  icon: z.string().default("tag"),
  color: z.string().default("#64748B"),
  parent: optionalObjectId,
  // Reporting rollup bucket; null clears it. Not an enum — the client offers a
  // preset list but a custom group is allowed to pass through.
  group: z.string().max(40).nullable().optional(),
  order: z.number().default(0),
  oneoffDefault: z.boolean().default(false),
});
export const categoryUpdateSchema = categorySchema.partial();

export const transactionSchema = z
  .object({
    type: z.enum(["income", "expense", "transfer"]),
    amount: z.number().positive("Amount must be greater than 0"),
    account: objectId,
    toAccount: optionalObjectId,
    category: optionalObjectId,
    date: z.coerce.date().default(() => new Date()),
    note: z.string().max(280).default(""),
    payee: z.string().max(120).default(""),
    tags: z.array(z.string()).default([]),
    oneoff: z.boolean().default(false),
    currency: z.string().default("INR"),
    loan: optionalObjectId,
    goal: optionalObjectId,
  })
  .refine((d) => d.type !== "transfer" || !!d.toAccount, {
    message: "Transfers require a destination account",
    path: ["toAccount"],
  })
  .refine((d) => d.type !== "transfer" || d.account !== d.toAccount, {
    message: "Source and destination accounts must differ",
    path: ["toAccount"],
  });

export const transactionUpdateSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]).optional(),
  amount: z.number().positive().optional(),
  account: objectId.optional(),
  toAccount: optionalObjectId,
  category: optionalObjectId,
  date: z.coerce.date().optional(),
  note: z.string().max(280).optional(),
  payee: z.string().max(120).optional(),
  tags: z.array(z.string()).optional(),
  oneoff: z.boolean().optional(),
  currency: z.string().optional(),
  loan: optionalObjectId,
  goal: optionalObjectId,
});

export const templateSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["income", "expense"]).default("expense"),
  amount: z.number().min(0).default(0),
  account: optionalObjectId,
  category: optionalObjectId,
  note: z.string().max(280).default(""),
  tags: z.array(z.string()).default([]),
  order: z.number().default(0),
});
export const templateUpdateSchema = templateSchema.partial();

export const budgetSchema = z.object({
  category: optionalObjectId,
  amount: z.number().positive(),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  startDate: z.coerce.date().default(() => new Date()),
  currency: z.string().default("INR"),
});
export const budgetUpdateSchema = budgetSchema.partial();

const recurringBase = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  amount: z.number().positive(),
  account: objectId,
  toAccount: optionalObjectId,
  category: optionalObjectId,
  note: z.string().max(280).default(""),
  payee: z.string().max(120).default(""),
  tags: z.array(z.string()).default([]),
  currency: z.string().default("INR"),
  loan: optionalObjectId,
  goal: optionalObjectId,
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).default("monthly"),
  interval: z.number().int().positive().default(1),
  startDate: z.coerce.date().default(() => new Date()),
  nextRun: z.coerce.date().optional(),
  endDate: z.coerce.date().nullish(),
  active: z.boolean().default(true),
});
// A recurring transfer must have a distinct destination — same rules as a one-off
// transfer, so a scheduled transfer can't silently drain an account every run.
export const recurringSchema = recurringBase
  .refine((d) => d.type !== "transfer" || !!d.toAccount, {
    message: "Transfers require a destination account",
    path: ["toAccount"],
  })
  .refine((d) => d.type !== "transfer" || d.account !== d.toAccount, {
    message: "Source and destination accounts must differ",
    path: ["toAccount"],
  });
export const recurringUpdateSchema = recurringBase.partial();
export const recurringPostOneSchema = z.object({
  amount: z.number().positive().optional(),
  date: z.coerce.date().optional(),
});

export const goalSchema = z.object({
  name: z.string().min(1).max(80),
  targetAmount: z.number().positive("Target must be greater than 0"),
  savedAmount: z.number().min(0).default(0),
  targetDate: z.coerce.date().nullish(),
  monthlyContribution: z.number().min(0).default(0),
  color: z.string().default("#6366F1"),
  icon: z.string().default("goal"),
  currency: z.string().default("INR"),
  // The wallet whose balance is this goal's progress; null tracks nothing.
  linkedAccount: optionalObjectId,
  // How often the goal starts over — "none" finishes for good.
  repeat: z.enum(["none", "monthly", "quarterly", "yearly"]).default("none"),
});
export const goalUpdateSchema = goalSchema.partial();
// A contribution can be negative to correct/withdraw; the service clamps saved ≥ 0.
export const goalContributeSchema = z.object({ amount: z.number() });

const SAVING_SUBS = ["fixed_deposit", "recurring_deposit", "emergency_fund", "retirement_fund"] as const;
const INVEST_SUBS = ["stocks", "mutual_funds", "real_estate", "bonds", "gold"] as const;

const holdingBase = z.object({
  name: z.string().min(1).max(80),
  class: z.enum(["saving", "investment"]),
  subtype: z.enum([...SAVING_SUBS, ...INVEST_SUBS]),
  value: z.number().min(0),
  provider: z.string().max(120).default(""),
  note: z.string().max(280).default(""),
  currency: z.string().default("INR"),
  // Optional deposit/growth details. All nullish so existing holdings are unaffected.
  investedAmount: z.number().min(0).nullish(),
  startDate: z.coerce.date().nullish(),
  maturityDate: z.coerce.date().nullish(),
  // Generous cap: an effective annual return never approaches this, but we'd
  // rather store an odd figure than reject the user's real one.
  interestRate: z.number().min(0).max(1000).nullish(),
  maturityValue: z.number().min(0).nullish(),
});

/** Subtype must belong to the chosen class (saving vs investment). */
function subtypeMatchesClass(d: { class: "saving" | "investment"; subtype: string }) {
  const allowed: readonly string[] = d.class === "saving" ? SAVING_SUBS : INVEST_SUBS;
  return allowed.includes(d.subtype);
}

export const holdingSchema = holdingBase.refine(subtypeMatchesClass, {
  message: "Subtype does not match the selected type",
  path: ["subtype"],
});
// Partial updates skip the cross-field check (class/subtype may arrive separately).
export const holdingUpdateSchema = holdingBase.partial();

const loanBase = z.object({
  name: z.string().min(1).max(80),
  lender: z.string().max(120).default(""),
  type: z.enum(["home", "personal", "car", "education", "gold", "business", "other"]).default("personal"),
  principal: z.number().min(0).default(0),
  outstanding: z.number().min(0),
  roi: z.number().min(0).max(100).default(0),
  emi: z.number().min(0).default(0),
  foreclosureChargePct: z.number().min(0).max(100).default(0),
  // Total tenure in months (0–600 = up to 50 years). endDate is derived from it.
  tenureMonths: z.number().int().min(0).max(600).nullish(),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  status: z.enum(["active", "closed"]).default("active"),
  note: z.string().max(280).default(""),
  currency: z.string().default("INR"),
});
export const loanSchema = loanBase
  // An EMI that doesn't clear the monthly interest can never reduce the balance —
  // the loan would amortize forever. Only checked when all three are meaningful.
  .refine((d) => !(d.emi > 0 && d.roi > 0 && d.outstanding > 0) || d.emi > (d.outstanding * d.roi) / 1200, {
    message: "EMI must be greater than the monthly interest, otherwise the loan never reduces",
    path: ["emi"],
  })
  .refine((d) => !d.startDate || !d.endDate || d.startDate <= d.endDate, {
    message: "Start date must be on or before the end date",
    path: ["endDate"],
  });
export const loanUpdateSchema = loanBase.partial();

export const CREDIT_METHODS = [
  "Cash", "GPay", "PhonePe", "Paytm", "UPI", "Net Banking",
  "Debit Card", "Credit Card", "Cheque", "Bank Transfer", "Other",
] as const;

export const PERSON_RELATIONS = ["family", "friend", "colleague", "other"] as const;

export const personSchema = z.object({
  name: z.string().min(1, "Enter a name").max(80),
  relation: z.enum(PERSON_RELATIONS).default("other"),
});
export const personUpdateSchema = personSchema.partial();
export const personMergeSchema = z.object({ into: objectId });

/** A group's members: existing people by id, or new ones by name (find-or-create). */
const groupMember = z.object({
  personId: optionalObjectId,
  name: z.string().max(80).optional(),
});
export const personGroupSchema = z.object({
  name: z.string().min(1, "Enter a name").max(80),
  members: z.array(groupMember).default([]),
});
export const personGroupUpdateSchema = personGroupSchema.partial();

export const creditSchema = z.object({
  person: z.string().min(1, "Enter a name").max(80),
  // Optional: sent when the person was picked from the list rather than typed.
  // Without it the name find-or-creates a Person — see personService.
  personId: optionalObjectId,
  // On a repayment: the individual lend being settled. Omit to settle generally,
  // which pays down their open lends oldest-first (see allocateOutstanding).
  settles: optionalObjectId,
  direction: z.enum(["given", "received", "borrowed", "repaid"]),
  // On `borrowed`: names the expense category when they paid for something you
  // consumed (rather than handing you cash). See creditService.
  category: optionalObjectId,
  amount: z.number().positive("Amount must be greater than 0"),
  date: z.coerce.date().default(() => new Date()),
  method: z.enum(CREDIT_METHODS).optional(),
  // Optional here; the service enforces that reflecting requires an account.
  account: optionalObjectId,
  note: z.string().max(280).default(""),
  reflected: z.boolean().default(false),
});
export const creditUpdateSchema = creditSchema.partial();

/**
 * A shared bill. `yourShare` + every participant's amount must equal
 * `totalAmount` — enforced in splitService.validateShares rather than here, so
 * the conservation rule lives in one testable place alongside the ledger legs
 * it protects.
 */
export const splitSchema = z.object({
  description: z.string().min(1, "Enter what the bill was for").max(120),
  totalAmount: z.number().positive("Amount must be greater than 0"),
  yourShare: z.number().min(0, "Your share cannot be negative"),
  date: z.coerce.date().default(() => new Date()),
  // Optional: not needed when someone else paid — nothing left your accounts.
  // The service requires it for a bill you paid.
  account: optionalObjectId,
  category: optionalObjectId,
  method: z.enum(CREDIT_METHODS).optional(),
  note: z.string().max(280).default(""),
  // Set when a FRIEND paid the bill. You then owe them your share, and the
  // participants list is irrelevant — you don't track what they owe the payer.
  paidBy: z.string().max(80).optional(),
  paidById: optionalObjectId,
  participants: z
    .array(
      z.object({
        person: z.string().min(1, "Enter a name").max(80),
        personId: optionalObjectId,
        amount: z.number().min(0, "A share cannot be negative"),
      })
    )
    .default([]),
});

export const loanPaySchema = z.object({
  amount: z.number().positive(),
  chargePct: z.number().min(0).max(100).optional(),
});
export const loanPrecloseSchema = z.object({ chargePct: z.number().min(0).max(100).default(0) });

/**
 * A stock symbol as the app stores it: an upstream-resolved NSE/BSE ticker. The
 * suffix is required because it is what makes the symbol unambiguous — a bare
 * "RELIANCE" matches several instruments across exchanges and currencies.
 */
const stockSymbol = z
  .string()
  .trim()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9&_-]+\.(NS|BO)$/, "Pick a stock from the search results");

/** Fees are one figure: brokerage + STT + stamp duty + GST, as the contract note shows. */
const stockFees = z.number().min(0).max(1_000_000).default(0);

export const stockBuySchema = z.object({
  symbol: stockSymbol,
  demat: objectId,
  // Fractional quantities are legitimate (bonus/split adjustments), so this is
  // not an integer — but zero would be a no-op position.
  qty: z.number().positive("Quantity must be greater than 0"),
  buyPrice: z.number().min(0),
  buyDate: z.coerce.date().default(() => new Date()),
  fees: stockFees,
  note: z.string().max(280).default(""),
  // False for shares bought before tracking began — see buyStock.
  recordCash: z.boolean().default(true),
});

export const stockSellSchema = z.object({
  symbol: stockSymbol,
  demat: objectId,
  qty: z.number().positive("Quantity must be greater than 0"),
  sellPrice: z.number().min(0),
  sellDate: z.coerce.date().default(() => new Date()),
  fees: stockFees,
  note: z.string().max(280).default(""),
});

export const settingsUpdateSchema = z.object({
  name: z.string().max(60).optional(),
  description: z.string().max(120).optional(),
  baseCurrency: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  locale: z.string().optional(),
  language: z.enum(["en", "ta"]).optional(),
  emailReports: z.boolean().optional(),
  currencies: z
    .array(
      z.object({
        code: z.string(),
        symbol: z.string(),
        name: z.string(),
        rateToBase: z.number().positive(),
      })
    )
    .optional(),
});
