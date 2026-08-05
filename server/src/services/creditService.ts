import type { Types } from "mongoose";
import { Transaction } from "../models/Transaction";
import { Credit, type CreditDirection } from "../models/Credit";
import { Category } from "../models/Category";
import { Account } from "../models/Account";
import { Person } from "../models/Person";
import { personKey, resolvePersonId } from "./personService";
import { HttpError } from "../middleware/errorHandler";

/**
 * Auto-managed "Money Lent" account — the receivable that money you lend moves
 * INTO (and repayments move back OUT of). Because lends/repayments are modelled
 * as transfers between your real account and this one, they never touch
 * income/expense, and your net worth stays flat while money is out (the drop in
 * your bank is offset by the rise here). See the Credits feature docs.
 */
const LENT_ACCOUNT = { system: "money_lent", name: "Money Lent", type: "receivable", icon: "hand-coins", color: "#F59E0B" } as const;

/**
 * Auto-managed "Money Owed" account — the MIRROR of Money Lent: what you owe
 * other people. Its balance runs negative, which is exactly what a liability
 * should do to net worth.
 *
 * Borrowing moves money INTO your account from here (or, when a friend paid for
 * something you consumed, funds that expense directly), so you never look richer
 * for having borrowed. Paying them back moves money from your account back here,
 * clearing the debt without counting as spending — you already recorded the
 * expense when you got the thing.
 */
const OWED_ACCOUNT = { system: "money_owed", name: "Money Owed", type: "payable", icon: "receipt-text", color: "#EF4444" } as const;

/** The auto-managed categories the Credits feature can tag transactions with.
 *  Only `received` (income) is used now — for the overpayment excess; `given`
 *  is retained so the legacy category backfill script still resolves. */
const CREDIT_CATEGORY = {
  given: { system: "credit_given", name: "Credit Given", type: "expense", icon: "hand-coins", color: "#F59E0B" },
  received: { system: "credit_received", name: "Credit Received", type: "income", icon: "coins", color: "#14B8A6" },
} as const;

/** Find — or lazily create — one of the auto-managed credit buckets. */
async function ensureSystemAccount(
  uid: unknown,
  spec: typeof LENT_ACCOUNT | typeof OWED_ACCOUNT
): Promise<Types.ObjectId> {
  const existing = await Account.findOne({ user: uid, system: spec.system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Account.create({
    user: uid,
    name: spec.name,
    type: spec.type,
    icon: spec.icon,
    color: spec.color,
    system: spec.system,
    initialBalance: 0,
    // Both count in net worth: the receivable as an asset, the payable as a
    // liability (its balance is negative). Excluding either would misstate it.
    includeInTotal: true,
  });
  return created._id as Types.ObjectId;
}

/** The "Money Lent" receivable — money owed TO you. */
export async function ensureLentAccount(uid: unknown): Promise<Types.ObjectId> {
  return ensureSystemAccount(uid, LENT_ACCOUNT);
}

/** The "Money Owed" payable — money YOU owe. */
export async function ensureOwedAccount(uid: unknown): Promise<Types.ObjectId> {
  return ensureSystemAccount(uid, OWED_ACCOUNT);
}

/**
 * Find — or lazily create — the credit category for a direction. Matched by the
 * stable `system` marker (not display name), so a renamed category still resolves
 * and a deleted one is recreated. `received` tags the overpayment-excess income;
 * kept general so the legacy backfill script (backfillCreditCategories) still works.
 */
export async function ensureCreditCategoryId(
  uid: unknown,
  direction: keyof typeof CREDIT_CATEGORY
): Promise<Types.ObjectId> {
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
 * THE MIRROR RULE: paying someone back clears what you owe them, and only the
 * part BEYOND that is real spending.
 *
 *   settleOwed(owed=500,   paid=500)  -> { neutral: 500, expense: 0 }
 *   settleOwed(owed=500,   paid=200)  -> { neutral: 200, expense: 0 }
 *   settleOwed(owed=500,   paid=700)  -> { neutral: 500, expense: 200 } (a gift/tip)
 *   settleOwed(owed=0,     paid=500)  -> { neutral: 0,   expense: 500 } (a gift)
 *
 * Symmetric to splitRepayment: there, money coming back isn't income; here,
 * money going out isn't spending. You already recorded the expense when your
 * friend paid for your meal — recording it again when you hand over the cash
 * would double-count it, which is the exact failure this rule prevents.
 *
 * A negative `owed` (they actually owe YOU) is treated as 0 owed, so paying in
 * that state is all a gift rather than a "negative clearing".
 */
export function settleOwed(owed: number, paid: number): { neutral: number; expense: number } {
  const owedByYou = Math.max(0, owed);
  const neutral = Math.min(Math.max(paid, 0), owedByYou);
  return { neutral, expense: Math.max(paid, 0) - neutral };
}

/**
 * Half a paisa — below this a lend counts as settled. Mirrors SETTLED_EPSILON on
 * the client: subtracting decimal amounts leaves float dust like 1e-10, and a
 * bare `=== 0` would keep a fully-repaid lend showing as open forever.
 */
export const SETTLED_EPSILON = 0.005;

/**
 * Which way a direction moves the person's balance. Positive = they owe you more.
 *
 *   given  +   you lent them            repaid +   you settled a debt of yours
 *   received − they paid you back       borrowed − they lent to (or paid for) you
 *
 * So one person has ONE net figure whichever way the money has flowed between you.
 */
export function directionSign(direction: CreditDirection): 1 | -1 {
  return direction === "given" || direction === "repaid" ? 1 : -1;
}

/** Whether a direction belongs to the asset side ("Money Lent") or the liability
 *  side ("Money Owed"). The two are separate accounts and never net against each
 *  other inside a reflection. */
export function isReceivableSide(direction: CreditDirection): boolean {
  return direction === "given" || direction === "received";
}

/** A ledger line, as much of it as the allocation rule needs. */
export interface AllocatableEntry {
  _id: unknown;
  direction: CreditDirection;
  amount: number;
  date: Date | string;
  /** On a repayment: the specific lend it pays down. Null = a general payment. */
  settles?: unknown;
}

/**
 * THE ALLOCATION RULE, as a pure function: how much of each individual lend is
 * still outstanding, once repayments are applied.
 *
 * A repayment either names the lend it settles (`settles`) or is general. Named
 * ones are applied to that lend exactly — that's what makes "settle up THIS
 * entry" mean something. Whatever is left over, plus every general repayment,
 * spills across the remaining lends OLDEST FIRST.
 *
 * The spill isn't a nicety, it's what keeps the two views agreeing: without it,
 * the per-entry figures and the person's net balance would drift apart the first
 * time anyone settled at the person level. With it:
 *
 *     Σ(per-entry outstanding) === max(0, given − received) === the person's net
 *
 * Over-paying a named lend is not an error — the excess simply rejoins the pool
 * and pays down the others, rather than leaving a negative balance on one line.
 */
export function allocateOutstanding(entries: AllocatableEntry[]): Map<string, number> {
  // Run the same rule down both sides: what they still owe you on each lend, and
  // what you still owe them on each borrow. The two never net against each other
  // — they are separate accounts (Money Lent / Money Owed).
  return new Map([
    ...allocateSide(entries, "given", "received"),
    ...allocateSide(entries, "borrowed", "repaid"),
  ]);
}

function allocateSide(
  entries: AllocatableEntry[],
  debtDirection: CreditDirection,
  paymentDirection: CreditDirection
): Map<string, number> {
  const lends = entries
    .filter((e) => e.direction === debtDirection)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const named = new Map<string, number>();
  let pool = 0;
  for (const e of entries) {
    if (e.direction !== paymentDirection) continue;
    const target = e.settles ? String(e.settles) : null;
    if (target) named.set(target, (named.get(target) ?? 0) + e.amount);
    else pool += e.amount;
  }

  const out = new Map<string, number>();
  for (const lend of lends) {
    const id = String(lend._id);
    const remaining = lend.amount - (named.get(id) ?? 0);
    // A repayment aimed at a lend that no longer exists (or overshoots one)
    // becomes general money rather than vanishing.
    if (remaining < 0) pool += -remaining;
    out.set(id, Math.max(0, remaining));
  }
  // Repayments named at a lend that isn't in this set at all still count.
  for (const [id, amount] of named) if (!out.has(id)) pool += amount;

  for (const lend of lends) {
    if (pool <= 0) break;
    const id = String(lend._id);
    const take = Math.min(out.get(id) ?? 0, pool);
    out.set(id, (out.get(id) ?? 0) - take);
    pool -= take;
  }
  return out;
}

/**
 * Which ledger an entry belongs to.
 *
 * An entry's identity is its `personRef`. Entries written before the People
 * registry (and any whose person was force-deleted) have none, so they fall back
 * to their name — resolved through `peopleByKey` so a legacy "Ravi" row still
 * groups with the Person record named Ravi instead of showing up as a second,
 * phantom Ravi. Once `backfill:people` has run every row carries a ref and the
 * fallback stops being reachable.
 *
 * The `id:` / `name:` prefixes keep the two namespaces from ever colliding.
 */
export function ledgerKey(
  entry: { personRef?: unknown; person: string },
  peopleByKey?: Map<string, string>
): string {
  if (entry.personRef) return `id:${String(entry.personRef)}`;
  const key = personKey(entry.person);
  const matched = peopleByKey?.get(key);
  return matched ? `id:${matched}` : `name:${key}`;
}

/** Normalised-name → person id, for resolving entries that predate personRef. */
async function peopleIndex(uid: unknown): Promise<Map<string, string>> {
  const people = await Person.find({ user: uid }).select("key").lean();
  return new Map(people.map((p) => [p.key, String(p._id)]));
}

/**
 * Net amount a person currently owes you (given − received), across their
 * entries EXCEPT `excludeId` (so an entry being edited doesn't count itself).
 * Positive = they owe you; negative = you owe them. Entries are matched by
 * ledger identity, the same way getCreditSummary groups.
 *
 * Pass `{ reflectedOnly: true }` to count ONLY entries reflected into balances.
 * Sizing a reflected repayment's neutralization MUST use this: the neutral part
 * is drawn back OUT of the "Money Lent" account, which only ever received the
 * REFLECTED lends. Capping it against unreflected IOUs (which never posted a
 * transfer in) would draw that receivable below zero — the exact drift that made
 * the Money Lent balance disagree with the Credits ledger's "You're owed".
 */
export async function personOutstanding(
  uid: unknown,
  identity: { personRef?: unknown; person: string },
  excludeId?: unknown,
  opts?: { reflectedOnly?: boolean; side?: "receivable" | "payable" }
): Promise<number> {
  const filter: Record<string, unknown> = { user: uid };
  if (opts?.reflectedOnly) filter.reflected = true;
  const [rows, index] = await Promise.all([
    Credit.find(filter).select("person personRef direction amount").lean(),
    peopleIndex(uid),
  ]);
  const key = ledgerKey(identity, index);
  let owed = 0;
  for (const r of rows) {
    if (String(r._id) === String(excludeId)) continue;
    if (ledgerKey(r, index) !== key) continue;
    // Sizing a repayment must look at ONE side only. The two buckets are
    // separate real accounts: neutralizing a "received" against money you
    // borrowed would draw Money Lent below what was ever lent — the same class
    // of drift the reflectedOnly flag exists to prevent.
    if (opts?.side === "receivable" && !isReceivableSide(r.direction)) continue;
    if (opts?.side === "payable" && isReceivableSide(r.direction)) continue;
    owed += directionSign(r.direction) * r.amount;
  }
  return owed;
}

/**
 * How much a payment can neutralize before it becomes real income/expense —
 * always POSITIVE, whichever side it is.
 *
 * personOutstanding is signed "positive = they owe you", which is right for a
 * person's balance but wrong as a size: on the payable side the thing a payment
 * clears is what YOU owe, i.e. the negative of that. Converting here rather than
 * at each call site is deliberate — getting the sign wrong made every repayment
 * fall through to "a gift", leaving the debt untouched and the payment booked as
 * spending.
 */
async function neutralizableBefore(
  uid: unknown,
  identity: { personRef?: unknown; person: string },
  excludeId: unknown,
  direction: CreditDirection
): Promise<number> {
  const receivable = isReceivableSide(direction);
  const net = await personOutstanding(uid, identity, excludeId, {
    reflectedOnly: true,
    side: receivable ? "receivable" : "payable",
  });
  return receivable ? net : -net;
}

export interface CreditInput {
  /** The person's display name. Used to find-or-create when no `personId` is given. */
  person: string;
  /** An existing Person to attach to — sent when one is picked from the list. */
  personId?: string | null;
  /** On a repayment: the individual lend it settles. Null = a general payment. */
  settles?: string | null;
  /**
   * On `borrowed`: set when they paid for something you CONSUMED, and it names
   * the expense category — this is what turns "Ravi bought my dinner" into a real
   * ₹500 Food expense plus a ₹500 debt, instead of phantom income. Omit it when
   * they simply handed you cash.
   */
  category?: string | null;
  direction: CreditDirection;
  amount: number;
  date: Date;
  method?: string;
  account?: string | null;
  note?: string;
  reflected: boolean;
  /** Set by splitService when this credit is one person's share of a shared bill. */
  split?: unknown;
}

const NOTE_PREFIX: Record<CreditDirection, string> = {
  given: "Given to",
  received: "Received from",
  borrowed: "Borrowed from",
  repaid: "Repaid to",
};

function defaultNote(data: Pick<CreditInput, "direction" | "person" | "note" | "method">): string {
  if (data.note) return data.note;
  const base = `${NOTE_PREFIX[data.direction]} ${data.person}`;
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
 * `outstandingBefore` = the person's REFLECTED receivable before this entry (only
 * reflected lends fund Money Lent, so only they can be neutralized against).
 */
async function rebuildReflection(uid: unknown, credit: any, data: CreditInput, outstandingBefore: number): Promise<void> {
  await clearReflectedTransactions(uid, credit);
  credit.transaction = null;
  credit.incomeTransaction = null;
  if (!data.reflected) return;
  const note = defaultNote(data);

  // Make sure THIS side's bucket exists, even when the legs below don't end up
  // touching it — a repayment with nothing outstanding posts only an income leg,
  // but "Money Lent" should still be on the books at zero rather than missing.
  // Kept per-side so someone who only ever borrows never gets an empty
  // "Money Lent" account, and vice versa.
  if (isReceivableSide(data.direction)) await ensureLentAccount(uid);
  else await ensureOwedAccount(uid);

  if (data.direction === "given") {
    const txn = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: data.amount,
      account: data.account, // money leaves your real account…
      toAccount: await ensureLentAccount(uid), // …and becomes a receivable
      category: null,
      date: data.date,
      note,
      payee: data.person,
      credit: credit._id,
    });
    credit.transaction = txn._id;
    return;
  }

  if (data.direction === "borrowed") {
    const owedAccount = await ensureOwedAccount(uid);
    if (data.category) {
      // They paid for something you CONSUMED (your share of a bill, say). It is a
      // real expense — funded by the debt rather than by your bank, so the expense
      // and the liability are recorded in one leg and your bank is untouched.
      const txn = await Transaction.create({
        user: uid,
        type: "expense",
        amount: data.amount,
        account: owedAccount,
        toAccount: null,
        category: data.category,
        date: data.date,
        note,
        payee: data.person,
        credit: credit._id,
      });
      credit.transaction = txn._id;
      return;
    }
    // They handed you CASH. Your account rises and so does what you owe, so your
    // net worth is unchanged — borrowing never makes you richer.
    const txn = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: data.amount,
      account: owedAccount, // drawn against the debt…
      toAccount: data.account, // …and into your real account
      category: null,
      date: data.date,
      note,
      payee: data.person,
      credit: credit._id,
    });
    credit.transaction = txn._id;
    return;
  }

  if (data.direction === "repaid") {
    // Clear what you owe; only money BEYOND that is real spending (a gift).
    const owedAccount = await ensureOwedAccount(uid);
    const { neutral, expense } = settleOwed(outstandingBefore, data.amount);
    if (neutral > 0) {
      const txn = await Transaction.create({
        user: uid,
        type: "transfer",
        amount: neutral,
        account: data.account, // money leaves your real account…
        toAccount: owedAccount, // …and cancels the debt
        category: null,
        date: data.date,
        note,
        payee: data.person,
        credit: credit._id,
      });
      credit.transaction = txn._id;
    }
    if (expense > 0) {
      const category = data.category ?? (await ensureCreditCategoryId(uid, "given"));
      const txn = await Transaction.create({
        user: uid,
        type: "expense",
        amount: expense,
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
    return;
  }

  // received: neutralize up to what they owed; the rest is real income.
  const { neutral, income } = splitRepayment(outstandingBefore, data.amount);
  if (neutral > 0) {
    const txn = await Transaction.create({
      user: uid,
      type: "transfer",
      amount: neutral,
      account: await ensureLentAccount(uid), // drawn from the receivable…
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
/**
 * Reflecting normally needs a real account to move money in or out of. The one
 * exception is a categorised `borrowed`: your friend paid, so nothing left YOUR
 * accounts — the expense is funded by the debt itself.
 */
function needsAccount(data: CreditInput): boolean {
  return !(data.direction === "borrowed" && !!data.category);
}

export async function createCredit(uid: unknown, data: CreditInput) {
  if (data.reflected && !data.account && needsAccount(data)) {
    throw new HttpError(400, "Pick an account to reflect this in your balances");
  }
  // Resolve to a Person record first — creating one when the name is new, which
  // is what makes "type someone the list doesn't have" just work.
  const personRef = await resolvePersonId(uid, { personId: data.personId, name: data.person });
  const credit = await Credit.create({
    ...data,
    personRef,
    method: data.method ?? "",
    account: data.account ?? null,
    note: data.note ?? "",
    user: uid,
    transaction: null,
    incomeTransaction: null,
  });
  // Outstanding BEFORE this entry = net of every other REFLECTED entry for the
  // person (only reflected lends fund the Money Lent a repayment neutralizes).
  // Size the neutralization against the SAME side the reflection will touch: a
  // repayment draws on Money Lent, paying someone back draws on Money Owed.
  const outstandingBefore = await neutralizableBefore(
    uid,
    { personRef, person: data.person },
    credit._id,
    data.direction
  );
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
    settles: "settles" in patch ? (patch.settles ?? null) : credit.settles ? String(credit.settles) : null,
    // Same omitted-vs-cleared distinction as `account`: an edit that doesn't
    // mention the category must keep it, so a "they paid for something" borrow
    // doesn't silently become a cash borrow.
    category: "category" in patch ? (patch.category ?? null) : credit.category ? String(credit.category) : null,
  };

  if (merged.reflected && !merged.account && needsAccount(merged)) {
    throw new HttpError(400, "Pick an account to reflect this in your balances");
  }

  // Re-resolve: the name may have been edited to a different person entirely.
  const personRef = await resolvePersonId(uid, { personId: patch.personId, name: merged.person });
  Object.assign(credit, { ...merged, personRef, account: merged.account ?? null });
  const outstandingBefore = await neutralizableBefore(
    uid,
    { personRef, person: merged.person },
    credit._id,
    merged.direction
  );
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

/**
 * Entries grouped by person with running net totals (positive = they owe you).
 *
 * Grouped by ledger identity rather than by the typed name, so renaming someone
 * doesn't fork their history and two spellings of one person can't drift apart.
 * `person` on each group is the Person record's current name where there is one,
 * which is what makes a rename show up across every past entry at once.
 */
export async function getCreditSummary(uid: unknown) {
  const [rows, people] = await Promise.all([listCredits(uid), Person.find({ user: uid }).lean()]);
  const index = new Map(people.map((p) => [p.key, String(p._id)]));
  const nameById = new Map(people.map((p) => [String(p._id), p.name]));
  const relationById = new Map(people.map((p) => [String(p._id), p.relation]));

  const byPerson = new Map<
    string,
    {
      person: string;
      personId: string | null;
      relation: string | null;
      given: number;
      received: number;
      borrowed: number;
      repaid: number;
      entries: typeof rows;
    }
  >();
  for (const r of rows) {
    const key = ledgerKey(r, index);
    const id = key.startsWith("id:") ? key.slice(3) : null;
    if (!byPerson.has(key)) {
      byPerson.set(key, {
        // Prefer the Person's current name so a rename propagates everywhere.
        person: (id && nameById.get(id)) || r.person,
        personId: id,
        relation: (id && relationById.get(id)) || null,
        given: 0,
        received: 0,
        borrowed: 0,
        repaid: 0,
        entries: [],
      });
    }
    const g = byPerson.get(key)!;
    g[r.direction as CreditDirection] += r.amount;
    g.entries.push(r);
  }
  return [...byPerson.values()]
    .map((g) => {
      // Per-lend outstanding, so each entry can be settled on its own and shows
      // how much of it is left. Allocated within the person, since a repayment
      // only ever pays down that person's lends.
      const outstanding = allocateOutstanding(g.entries as AllocatableEntry[]);
      return {
        ...g,
        // One figure per person across BOTH sides: what they owe you, less what
        // you owe them. Positive = they owe you.
        net: g.given + g.repaid - g.received - g.borrowed,
        entries: g.entries.map((e) => {
          const left = outstanding.get(String(e._id));
          return {
            ...e,
            // Only lends carry an outstanding; a repayment is already money moved.
            outstanding: left ?? null,
            settled: left != null ? left < SETTLED_EPSILON : null,
          };
        }),
      };
    })
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}
