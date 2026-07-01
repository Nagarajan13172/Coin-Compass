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
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Missing verification token").max(400),
});

export const accountSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["cash", "bank", "card", "wallet", "savings"]).default("cash"),
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
  order: z.number().default(0),
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
    currency: z.string().default("INR"),
    loan: optionalObjectId,
  })
  .refine((d) => d.type !== "transfer" || !!d.toAccount, {
    message: "Transfers require a destination account",
    path: ["toAccount"],
  })
  .refine((d) => d.type === "transfer" || d.account !== d.toAccount, {
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
  currency: z.string().optional(),
  loan: optionalObjectId,
});

export const budgetSchema = z.object({
  category: optionalObjectId,
  amount: z.number().positive(),
  period: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
  startDate: z.coerce.date().default(() => new Date()),
  rollover: z.boolean().default(false),
  currency: z.string().default("INR"),
});
export const budgetUpdateSchema = budgetSchema.partial();

export const recurringSchema = z.object({
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
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).default("monthly"),
  interval: z.number().int().positive().default(1),
  startDate: z.coerce.date().default(() => new Date()),
  nextRun: z.coerce.date().optional(),
  endDate: z.coerce.date().nullish(),
  active: z.boolean().default(true),
});
export const recurringUpdateSchema = recurringSchema.partial();
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

export const loanSchema = z.object({
  name: z.string().min(1).max(80),
  lender: z.string().max(120).default(""),
  type: z.enum(["home", "personal", "car", "education", "gold", "business", "other"]).default("personal"),
  principal: z.number().min(0).default(0),
  outstanding: z.number().min(0),
  roi: z.number().min(0).max(100).default(0),
  emi: z.number().min(0).default(0),
  foreclosureChargePct: z.number().min(0).max(100).default(0),
  startDate: z.coerce.date().nullish(),
  endDate: z.coerce.date().nullish(),
  status: z.enum(["active", "closed"]).default("active"),
  note: z.string().max(280).default(""),
  currency: z.string().default("INR"),
});
export const loanUpdateSchema = loanSchema.partial();
export const loanPaySchema = z.object({
  amount: z.number().positive(),
  chargePct: z.number().min(0).max(100).optional(),
});
export const loanPrecloseSchema = z.object({ chargePct: z.number().min(0).max(100).default(0) });

export const settingsUpdateSchema = z.object({
  name: z.string().max(60).optional(),
  description: z.string().max(120).optional(),
  baseCurrency: z.string().optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  locale: z.string().optional(),
  firstDayOfWeek: z.number().min(0).max(6).optional(),
  monthStartDay: z.number().min(1).max(28).optional(),
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
