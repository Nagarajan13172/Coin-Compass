import type { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { Credit, type CreditDirection } from "../models/Credit";
import { HttpError } from "../middleware/errorHandler";

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

/** The linked transaction a credit's `reflected` flag creates — an expense when
 *  money left an account (given), income when it arrived (received). Only called
 *  once we've confirmed an account is present (reflecting requires one). */
function txnPayload(uid: unknown, data: CreditInput, creditId: unknown) {
  return {
    user: uid,
    type: data.direction === "given" ? "expense" : "income",
    amount: data.amount,
    account: data.account,
    toAccount: null,
    category: null,
    date: data.date,
    note: defaultNote(data),
    payee: data.person,
    credit: creditId,
  };
}

/** Create a credit entry, optionally creating its linked transaction. */
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
  });
  if (data.reflected) {
    const txn = await Transaction.create(txnPayload(uid, data, credit._id));
    credit.transaction = txn._id as Types.ObjectId;
    await credit.save();
  }
  return credit;
}

/**
 * Update a credit entry, keeping its linked transaction in sync: creates one if
 * `reflected` just turned on, updates it in place if still on, or deletes it if
 * `reflected` just turned off.
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
    account: patch.account ?? (credit.account ? String(credit.account) : null),
    note: patch.note ?? credit.note,
    reflected: patch.reflected ?? credit.reflected,
  };

  if (merged.reflected && !merged.account) {
    throw new HttpError(400, "Pick an account to reflect this in your balances");
  }

  const hadTxn = credit.transaction;
  Object.assign(credit, { ...merged, account: merged.account ?? null });

  if (merged.reflected && hadTxn) {
    await Transaction.updateOne({ _id: hadTxn, user: uid }, txnPayload(uid, merged, credit._id));
  } else if (merged.reflected && !hadTxn) {
    const txn = await Transaction.create(txnPayload(uid, merged, credit._id));
    credit.transaction = txn._id as Types.ObjectId;
  } else if (!merged.reflected && hadTxn) {
    await Transaction.deleteOne({ _id: hadTxn, user: uid });
    credit.transaction = null;
  }

  await credit.save();
  return credit;
}

/** Delete a credit entry and its linked transaction (if any). */
export async function deleteCredit(uid: unknown, creditId: unknown): Promise<boolean> {
  const credit = await Credit.findOneAndDelete({ _id: creditId, user: uid });
  if (!credit) return false;
  if (credit.transaction) await Transaction.deleteOne({ _id: credit.transaction, user: uid });
  return true;
}

/**
 * Un-link a credit's transaction without deleting the credit entry itself — the
 * money movement it recorded still happened, only the accounting record is gone.
 * Used when that transaction is deleted directly from the Transactions page, or
 * edited into something a credit can't represent (e.g. changed to a transfer).
 */
export async function unlinkCreditTransaction(uid: unknown, creditId: unknown): Promise<void> {
  await Credit.updateOne({ _id: creditId, user: uid }, { reflected: false, transaction: null });
}

/** Keep a credit's amount/date/account/direction in sync when its linked
 *  transaction is edited directly from the Transactions page. */
export async function syncCreditFromTransaction(
  uid: unknown,
  creditId: unknown,
  fields: { amount: number; date: Date; account: unknown; direction: CreditDirection }
): Promise<void> {
  await Credit.updateOne({ _id: creditId, user: uid }, fields);
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
