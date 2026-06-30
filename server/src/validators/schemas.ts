import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const optionalObjectId = objectId.nullish();

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
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]).default("monthly"),
  interval: z.number().int().positive().default(1),
  startDate: z.coerce.date().default(() => new Date()),
  nextRun: z.coerce.date().optional(),
  endDate: z.coerce.date().nullish(),
  active: z.boolean().default(true),
});
export const recurringUpdateSchema = recurringSchema.partial();

export const settingsUpdateSchema = z.object({
  name: z.string().max(60).optional(),
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
