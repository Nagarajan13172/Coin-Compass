import type { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { Credit, type CreditDirection } from "../models/Credit";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { HttpError } from "../middleware/errorHandler";

/**
 * Auto-managed "Money Lent" account — the receivable that money you lend moves
 * INTO (and repayments move back OUT of). Because lends/repayments are modelled
 * as transfers between your real account and this one, they never touch
 * income/expense, and your net worth stays flat while money is out (the drop in
 * your bank is offset by the rise here). See the Credits feature docs.
 */
const LENT_ACCOUNT = { system: "money_lent", name: "Money Lent", type: "receivable", icon: "hand-coins", color: "#F59E0B" } as const;

/** The auto-managed categories the Credits feature can tag transactions with.
 *  Only `received` (income) is used now — for the overpayment excess; `given`
 *  is retained so the legacy category backfill script still resolves. */
const CREDIT_CATEGORY = {
  given: { system: "credit_given", name: "Credit Given", type: "expense", icon: "hand-coins", color: "#F59E0B" },
  received: { system: "credit_received", name: "Credit Received", type: "income", icon: "coins", color: "#14B8A6" },
} as const;

/** Find — or lazily create — the auto-managed "Money Lent" receivable account. */
export async function ensureLentAccount(uid: unknown): Promise<Types.ObjectId> {
  const existing = await Account.findOne({ user: uid, system: LENT_ACCOUNT.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Account.create({
    user: uid,
    name: LENT_ACCOUNT.name,
    type: LENT_ACCOUNT.type,
    icon: LENT_ACCOUNT.icon,
    color: LENT_ACCOUNT.color,
    system: LENT_ACCOUNT.system,
    initialBalance: 0,
    includeInTotal: true, // it's a real asset (money owed to you) — counts in net worth
  });
  return created._id as Types.ObjectId;
}

/**
 * Find — or lazily create — the credit category for a direction. Matched by the
 * stable `system` marker (not display name), so a renamed category still resolves
 * and a deleted one is recreated. `received` tags the overpayment-excess income;
 * kept general so the legacy backfill script (backfillCreditCategories) still works.
 */
export async function ensureCreditCategoryId(uid: unknown, direction: CreditDirection): Promise<Types.ObjectId> {
  const spec = CREDIT_CATEGORY[direction];
  const existing = await Category.findOne({ user: uid, system: spec.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Category.create({
    user: uid,
    name: spec.name,
    type: spec.type,
    icon: spec.icon,
    color: spec.color,
    isDefault: true,
    system: spec.system,
  });
  return created._id as Types.ObjectId;
}

/**
 * THE RULE, as a pure function: a repayment neutralizes what the person owes you,
 * and only the part BEYOND that is real income.
 *
 *   splitRepayment(owed=20000, received=15000) -> { neutral: 15000, income: 0 }
 *   splitRepayment(owed=5000,  received=5000)  -> { neutral: 5000,  income: 0 }
 *   splitRepayment(owed=20000, received=22000) -> { neutral: 20000, income: 2000 }
 *   splitRepayment(owed=0,     received=5000)  -> { neutral: 0,     income: 5000 } (a gift)
 *
 * A negative `owed` (you actually owe THEM) is treated as 0 owed — receiving more
 * money in that state is all income, never a "negative neutralization".
 */
export function splitRepayment(owed: number, received: number): { neutral: number; income: number } {
  const owedToYou = Math.max(0, owed);
  const neutral = Math.min(Math.max(received, 0), owedToYou);
  return { neutral, income: Math.max(received, 0) - neutral };
}

/**
 * Net amount a person currently owes you (given − received), across all their
 * entries EXCEPT `excludeId` (so an entry being edited doesn't count itself).
 * Positive = they owe you; negative = you owe them. Person is matched
 * case-insensitively, the same way getCreditSummary groups.
 */
export async function personOutstanding(uid: unknown, person: string, excludeId?: unknown): Promise<number> {
  const rows = await Credit.find({ user: uid }).select("person direction amount").lean();
  const key = person.trim().toLowerCase();
  let owed = 0;
  for (const r of rows) {
    if (String(r._id) === String(excludeId)) continue;
    if (r.person.trim().toLowerCase() !== key) continue;
    owed += r.direction === "given" ? r.amount : -r.amount;
  }
  return owed;
}

export interface CreditInput {
  person: string;
  direction: CreditDirection;
  amount: number;
  date: Date;
  method?: string;
  account?: string | null;
  note?: string;
  reflected: boolean;
}

function defaultNote(data: Pick<CreditInput, "direction" | "person" | "note" | "method">): string {
  if (data.note) return data.note;
  const base = data.direction === "given" ? `Given to ${data.person}` : `Received from ${data.person}`;
  return data.method ? `${base} via ${data.method}` : base;
}

/** Delete both reflected legs of a credit (the transfer + any overpayment income). */
async function clearReflectedTransactions(uid: unknown, credit: { transaction?: unknown; incomeTransaction?: unknown }): Promise<void> {
  const ids = [credit.transaction, credit.incomeTransaction].filter(Boolean);
  if (ids.length) await Transaction.deleteMany({ _id: { $in: ids }, user: uid });
}

/**
 * (Re)build a reflected credit's transaction legs from scratch. Deletes any
 * existing legs first, then — if `reflected` — creates:
 *   • GIVEN     → one TRANSFER  yourAccount → Money Lent  (you lent; receivable up)
 *   • RECEIVED  → one TRANSFER  Money Lent → yourAccount  for the neutralized part,
 *                 PLUS an INCOME txn for any excess beyond what they owed.
 * Neither leg is ever an expense, and only the true excess is income.
 * `outstandingBefore` = what the person owed you before this entry.
 */
async function rebuildReflection(uid: unknown, credit: any, data: CreditInput, outstandingBefore: number): Promise<void> {
  await clearReflectedTransactions(uid, credit);
  credit.transaction = null;
  credit.incomeTransaction = null;
  if (!data.reflected) return;

  const lentAccount = await ensureLentAccount(uid);
  const note = defaultNote(data);

  if (data.direction === "given") {
    const txn = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: data.amount,
      account: data.account, // money leaves your real account…
      toAccount: lentAccount, // …and becomes a receivable
      category: null,
      date: data.date,
      note,
      payee: data.person,
      credit: credit._id,
    });
    credit.transaction = txn._id;
    return;
  }

  // received: neutralize up to what they owed; the rest is real income.
  const { neutral, income } = splitRepayment(outstandingBefore, data.amount);
  if (neutral > 0) {
    const txn = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: neutral,
      account: lentAccount, // drawn from the receivable…
      toAccount: data.account, // …back into your real account
      category: null,
      date: data.date,
      note,
      payee: data.person,
      credit: credit._id,
    });
    credit.transaction = txn._id;
  }
  if (income > 0) {
    const category = await ensureCreditCategoryId(uid, "received");
    const txn = await Transaction.create({
      user: uid,
      type: "income",
      amount: income,
      account: data.account,
      toAccount: null,
      category,
      date: data.date,
      note: neutral > 0 ? `${note} (extra over dues)` : note,
      payee: data.person,
      credit: credit._id,
    });
    credit.incomeTransaction = txn._id;
  }
}

/** Create a credit entry, optionally creating its reflected transaction leg(s). */
export async function createCredit(uid: unknown, data: CreditInput) {
  if (data.reflected && !data.account) {
    throw new HttpError(400, "Pick an account to reflect this in your balances");
  }
  const credit = await Credit.create({
    ...data,
    method: data.method ?? "",
    account: data.account ?? null,
    note: data.note ?? "",
    user: uid,
    transaction: null,
    incomeTransaction: null,
  });
  // Outstanding BEFORE this entry = net of every other entry for the person.
  const outstandingBefore = await personOutstanding(uid, data.person, credit._id);
  await rebuildReflection(uid, credit, data, outstandingBefore);
  await credit.save();
  return credit;
}

/**
 * Update a credit entry, rebuilding its reflected transaction legs to match.
 * The reflection is always torn down and recreated, so amount/direction/account/
 * reflected changes stay consistent (incl. flipping reflected on or off).
 */
export async function updateCredit(uid: unknown, creditId: unknown, patch: Partial<CreditInput>) {
  const credit = await Credit.findOne({ _id: creditId, user: uid });
  if (!credit) return null;

  const merged: CreditInput = {
    person: patch.person ?? credit.person,
    direction: patch.direction ?? (credit.direction as CreditDirection),
    amount: patch.amount ?? credit.amount,
    date: patch.date ?? credit.date,
    method: patch.method ?? credit.method,
    // Distinguish "account omitted" (keep current) from "account: null" (clear it).
    account: "account" in patch ? (patch.account ?? null) : credit.account ? String(credit.account) : null,
    note: patch.note ?? credit.note,
    reflected: patch.reflected ?? credit.reflected,
  };

  if (merged.reflected && !merged.account) {
    throw new HttpError(400, "Pick an account to reflect this in your balances");
  }

  Object.assign(credit, { ...merged, account: merged.account ?? null });
  const outstandingBefore = await personOutstanding(uid, merged.person, credit._id);
  await rebuildReflection(uid, credit, merged, outstandingBefore);
  await credit.save();
  return credit;
}

/** Delete a credit entry and both of its reflected transaction legs (if any). */
export async function deleteCredit(uid: unknown, creditId: unknown): Promise<boolean> {
  const credit = await Credit.findOneAndDelete({ _id: creditId, user: uid });
  if (!credit) return false;
  await clearReflectedTransactions(uid, credit);
  return true;
}

/**
 * A credit and its reflected transaction(s) are two sides of one event: when one
 * of those transactions is deleted from the Transactions page, remove the credit
 * AND its other leg so nothing is left orphaned. (The triggering transaction is
 * already being deleted by the caller; deleting it again here is a harmless no-op.)
 */
export async function deleteCreditForTransaction(uid: unknown, creditId: unknown): Promise<void> {
  const credit = await Credit.findOneAndDelete({ _id: creditId, user: uid });
  if (credit) await clearReflectedTransactions(uid, credit);
}

/**
 * Detach a credit's reflection without deleting the credit entry: turn `reflected`
 * off and drop the leg links, deleting the OTHER leg but keeping `keepTxnId`
 * (the transaction the user is editing directly on the Transactions page — it
 * becomes a standalone transaction). The credit stays as a pure ledger entry.
 */
export async function unlinkCreditTransaction(uid: unknown, creditId: unknown, keepTxnId?: unknown): Promise<void> {
  const credit = await Credit.findOne({ _id: creditId, user: uid });
  if (!credit) return;
  const toDelete = [credit.transaction, credit.incomeTransaction].filter(
    (id) => id && String(id) !== String(keepTxnId)
  );
  if (toDelete.length) await Transaction.deleteMany({ _id: { $in: toDelete }, user: uid });
  credit.reflected = false;
  credit.transaction = null;
  credit.incomeTransaction = null;
  await credit.save();
}

/** Every credit entry, newest first. */
export async function listCredits(uid: unknown, person?: string) {
  const filter: Record<string, unknown> = { user: uid };
  if (person) filter.person = person;
  return Credit.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .populate({ path: "account", select: "name color icon currency" })
    .lean();
}

/** Entries grouped by person with running net totals (positive = they owe you). */
export async function getCreditSummary(uid: unknown) {
  const rows = await listCredits(uid);
  const byPerson = new Map<
    string,
    { person: string; given: number; received: number; entries: typeof rows }
  >();
  for (const r of rows) {
    const key = r.person.trim().toLowerCase();
    if (!byPerson.has(key)) byPerson.set(key, { person: r.person, given: 0, received: 0, entries: [] });
    const g = byPerson.get(key)!;
    if (r.direction === "given") g.given += r.amount;
    else g.received += r.amount;
    g.entries.push(r);
  }
  return [...byPerson.values()]
    .map((g) => ({ ...g, net: g.given - g.received }))
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}
