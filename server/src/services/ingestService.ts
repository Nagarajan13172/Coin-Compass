import { Types } from "mongoose";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { IngestedPayment, type IngestStatus } from "../models/IngestedPayment";
import { getSettings } from "../models/Settings";
import { notify } from "./notificationService";

// ---------------------------------------------------------------------------
// Pure parser — no DB. Extracts a structured payment from a notification/SMS.
// ---------------------------------------------------------------------------

export interface ParsedPayment {
  amount: number | null;
  direction: "income" | "expense" | null;
  merchant: string;
  accountLast4: string;
  upiRef: string;
  occurredAt: Date | null;
  /** 0..1 — how sure we are this is a real, well-formed payment. */
  confidence: number;
  /** True when the text looks like a promo/offer/OTP rather than a payment. */
  promo: boolean;
}

// Words that signal money LEFT the account (an expense).
const DEBIT_WORDS = /\b(paid|debited|debit|spent|sent|withdrawn|withdrawal|purchase|deducted)\b/i;
// Words that signal money ARRIVED (income).
const CREDIT_WORDS = /\b(received|credited|credit|refunded|refund|deposited|added)\b/i;
// Marketing / non-transaction noise that must never auto-post.
const PROMO_WORDS =
  /\b(cashback|reward|rewards|offer|discount|coupon|voucher|win|won|congratulations|eligible|scratch|% ?off|sale|earn|will be credited|get \W?\d)\b/i;

/** Pull the first ₹/Rs/INR amount out of the text. */
function extractAmount(text: string): number | null {
  const m = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Merchant/payee — "to X" (outgoing), "from X" (incoming), or "at X" (card). */
function extractMerchant(text: string): string {
  const patterns = [
    /\bto\s+(?:vpa\s+)?([A-Za-z0-9][A-Za-z0-9 .&'@_-]{1,48}?)(?=\s+(?:on|via|ref|upi|for|dated|a\/c|account|\.|,|$))/i,
    /\bfrom\s+([A-Za-z0-9][A-Za-z0-9 .&'@_-]{1,48}?)(?=\s+(?:on|via|ref|upi|for|dated|a\/c|account|\.|,|$))/i,
    /\bat\s+([A-Za-z0-9][A-Za-z0-9 .&'_-]{1,48}?)(?=\s+(?:on|via|ref|upi|for|dated|\.|,|$))/i,
    /\bto\s+(?:vpa\s+)?([A-Za-z0-9][A-Za-z0-9 .&'@_-]{1,48})$/i,
    /\bfrom\s+([A-Za-z0-9][A-Za-z0-9 .&'@_-]{1,48})$/i,
    /\bat\s+([A-Za-z0-9][A-Za-z0-9 .&'_-]{1,48})$/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim().replace(/\s{2,}/g, " ");
  }
  return "";
}

/** Last 3–4 digits of the account/card, e.g. "A/c XX1234" → "1234". */
function extractAccountLast4(text: string): string {
  const m = text.match(/(?:a\/c|ac|acct|account|card)\s*(?:no\.?)?\s*[Xx*.]*(\d{3,4})\b/i);
  return m?.[1] ?? "";
}

/** UPI reference / transaction id — a strong signal the text is a real payment. */
function extractUpiRef(text: string): string {
  const m = text.match(
    /(?:upi(?:\s*(?:ref(?:erence)?)?(?:\s*no)?)?|ref(?:erence)?(?:\s*no)?|txn(?:\s*(?:id|no))?|transaction\s*id)\s*[:#.]?\s*([0-9]{6,})/i
  );
  return m?.[1] ?? "";
}

/**
 * Parse a raw payment notification/SMS into a structured payment with a
 * confidence score. Confidence rewards a clear direction, a merchant, and a UPI
 * reference; it stays 0 when no amount is present.
 */
export function parsePaymentText(text: string): ParsedPayment {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  const amount = extractAmount(clean);
  const promo = PROMO_WORDS.test(clean);

  if (amount == null) {
    return { amount: null, direction: null, merchant: "", accountLast4: "", upiRef: "", occurredAt: null, confidence: 0, promo };
  }

  const isDebit = DEBIT_WORDS.test(clean);
  const isCredit = CREDIT_WORDS.test(clean);
  // If both (or neither) match, direction is ambiguous → leave null (forces review).
  const direction: "income" | "expense" | null = isDebit === isCredit ? null : isDebit ? "expense" : "income";

  const merchant = extractMerchant(clean);
  const accountLast4 = extractAccountLast4(clean);
  const upiRef = extractUpiRef(clean);

  let confidence = 0.4; // has an amount
  if (direction) confidence += 0.3;
  if (merchant) confidence += 0.2;
  if (upiRef) confidence += 0.2;
  if (accountLast4) confidence += 0.1;
  confidence = Math.min(1, confidence);

  return { amount, direction, merchant, accountLast4, upiRef, occurredAt: null, confidence, promo };
}

// ---------------------------------------------------------------------------
// Category guessing — merchant keyword → one of the seeded category names.
// ---------------------------------------------------------------------------

const MERCHANT_CATEGORY: Array<{ name: string; re: RegExp }> = [
  { name: "Groceries", re: /\b(blinkit|bigbasket|big ?basket|dmart|d-?mart|zepto|instamart|grofers|jiomart|supermarket|grocery|kirana|more retail)\b/i },
  { name: "Food & Dining", re: /\b(zomato|swiggy|restaurant|cafe|coffee|dominos|mcdonald|kfc|pizza|hotel|biryani|bakery|eatery|starbucks|burger)\b/i },
  { name: "Transport", re: /\b(uber|ola|rapido|irctc|metro|redbus|namma yatri|cab|auto|taxi)\b/i },
  { name: "Fuel", re: /\b(petrol|diesel|fuel|hpcl|hp petrol|iocl|indian ?oil|bpcl|bharat petroleum|shell|nayara)\b/i },
  { name: "Shopping", re: /\b(amazon|flipkart|myntra|ajio|meesho|nykaa|tatacliq|snapdeal|reliance digital|croma)\b/i },
  { name: "Recharges", re: /\b(recharge|jio|airtel|vodafone|\bvi\b|bsnl|dth|prepaid)\b/i },
  { name: "Bills & Utilities", re: /\b(electricity|water bill|gas bill|bescom|tneb|tangedco|bill ?desk|billpay|utility|broadband|wifi)\b/i },
  { name: "Subscriptions", re: /\b(netflix|spotify|hotstar|prime video|youtube premium|subscription|disney|sony liv|zee5)\b/i },
  { name: "Entertainment", re: /\b(bookmyshow|pvr|inox|cinema|movie|gaming|playstation|steam)\b/i },
  { name: "Health", re: /\b(pharmacy|apollo|medplus|netmeds|pharmeasy|1mg|hospital|clinic|medical|diagnostics|lab)\b/i },
  { name: "Travel", re: /\b(makemytrip|goibibo|ixigo|indigo|air ?india|vistara|spicejet|airlines|flight|oyo|airbnb)\b/i },
  { name: "Cash Withdrawal", re: /\b(atm|cash withdrawal|withdrawn at)\b/i },
];

/** The seeded income category a keyword suggests (falls back to Other later). */
const INCOME_CATEGORY: Array<{ name: string; re: RegExp }> = [
  { name: "Salary", re: /\b(salary|payroll|wages)\b/i },
  { name: "Interest", re: /\b(interest|int\.? cr)\b/i },
  { name: "Refunds", re: /\b(refund|reversal|reversed)\b/i },
];

function guessCategoryName(direction: "income" | "expense", text: string): string {
  const table = direction === "expense" ? MERCHANT_CATEGORY : INCOME_CATEGORY;
  for (const { name, re } of table) if (re.test(text)) return name;
  return "Other";
}

/** A stable fallback category ("Uncategorized") so an auto-committed txn is never
 *  left without one. Matched by a system marker, mirroring the Credits pattern. */
async function ensureUncategorized(uid: unknown, type: "income" | "expense"): Promise<Types.ObjectId> {
  const system = `auto_uncategorized_${type}`;
  const existing = await Category.findOne({ user: uid, system });
  if (existing) return existing._id as Types.ObjectId;
  const created = await Category.create({
    user: uid,
    name: "Uncategorized",
    type,
    icon: "circle-help",
    color: "#94A3B8",
    isDefault: true,
    system,
  });
  return created._id as Types.ObjectId;
}

async function resolveCategory(uid: unknown, direction: "income" | "expense", text: string): Promise<Types.ObjectId> {
  const guessed = guessCategoryName(direction, text);
  // Case-insensitive exact match against the user's categories of the right type.
  const match = await Category.findOne({
    user: uid,
    type: direction,
    name: new RegExp(`^${guessed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
  });
  if (match) return match._id as Types.ObjectId;
  return ensureUncategorized(uid, direction);
}

/**
 * Which account a captured payment lands in: the user's configured default, else
 * an existing UPI account, else a freshly-created "UPI" account (GPay is UPI).
 */
async function resolveAccount(uid: string, defaultAccount: unknown): Promise<Types.ObjectId> {
  if (defaultAccount) {
    const acc = await Account.findOne({ _id: defaultAccount, user: uid }).select("_id");
    if (acc) return acc._id as Types.ObjectId;
  }
  const upi = await Account.findOne({ user: uid, type: "upi", archived: false }).select("_id");
  if (upi) return upi._id as Types.ObjectId;
  const created = await Account.create({ user: uid, name: "UPI", type: "upi", icon: "smartphone", color: "#6366F1" });
  return created._id as Types.ObjectId;
}

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

const DEDUPE_WINDOW_MS = 3 * 60 * 1000;

function dedupeKeyFor(p: ParsedPayment, at: Date): string {
  if (p.upiRef) return `ref:${p.upiRef}`;
  const bucket = Math.floor(at.getTime() / DEDUPE_WINDOW_MS);
  return `amt:${p.amount}:${p.direction ?? "?"}:${bucket}`;
}

/** Confidence at/above this auto-commits (with a known direction, no promo words). */
export const AUTO_COMMIT_THRESHOLD = 0.7;

export interface IngestInput {
  text: string;
  title?: string;
  source?: string;
  postedAt?: number | string;
}

export interface IngestResult {
  status: IngestStatus;
  id?: string;
  transactionId?: string;
  parsed?: ParsedPayment;
}

/**
 * The full ingest pipeline for one captured payment: parse → dedupe → resolve
 * account/category → auto-commit (create a real transaction) when confident, or
 * queue for review. Every outcome raises the matching in-app notification.
 */
export async function ingestPayment(uid: string, input: IngestInput): Promise<IngestResult> {
  const combined = [input.title, input.text].filter(Boolean).join(" ").trim();
  const parsed = parsePaymentText(combined);
  const postedAt = input.postedAt != null ? new Date(Number(input.postedAt) || Date.parse(String(input.postedAt))) : null;
  const occurredAt = postedAt && !Number.isNaN(postedAt.getTime()) ? postedAt : new Date();
  parsed.occurredAt = occurredAt;

  const base = {
    user: new Types.ObjectId(uid),
    source: input.source ?? "",
    rawText: combined.slice(0, 2000),
    parsed: {
      amount: parsed.amount,
      direction: parsed.direction,
      merchant: parsed.merchant,
      accountLast4: parsed.accountLast4,
      upiRef: parsed.upiRef,
      occurredAt,
    },
    confidence: parsed.confidence,
  };

  // No amount → nothing to record as a payment.
  if (parsed.amount == null) {
    await IngestedPayment.create({ ...base, status: "unparsed" });
    return { status: "unparsed", parsed };
  }

  // Dedupe against a recent live capture (same UPI ref, or same amount+direction
  // within the time window). Never creates a second transaction.
  const dedupeKey = dedupeKeyFor(parsed, occurredAt);
  const dup = await IngestedPayment.findOne({
    user: uid,
    dedupeKey,
    status: { $in: ["committed", "pending"] },
  }).select("transaction");
  if (dup) {
    return { status: "duplicate", transactionId: dup.transaction ? String(dup.transaction) : undefined, parsed };
  }

  // Promo/offer text with no UPI ref is noise — record it but never post/queue it.
  if (parsed.promo && !parsed.upiRef) {
    const doc = await IngestedPayment.create({ ...base, status: "ignored", dedupeKey });
    return { status: "ignored", id: String(doc._id), parsed };
  }

  const settings = await getSettings(uid);
  const account = await resolveAccount(uid, settings.ingestDefaultAccount);

  const autoCommit = parsed.confidence >= AUTO_COMMIT_THRESHOLD && parsed.direction != null && !parsed.promo;

  if (autoCommit && parsed.direction) {
    const category = await resolveCategory(uid, parsed.direction, combined);
    const txn = await Transaction.create({
      user: uid,
      type: parsed.direction,
      amount: parsed.amount,
      account,
      category,
      date: occurredAt,
      note: parsed.merchant ? "" : "Auto-captured payment",
      payee: parsed.merchant,
      tags: ["auto"],
    });
    const doc = await IngestedPayment.create({
      ...base,
      status: "committed",
      transaction: txn._id,
      account,
      category,
      dedupeKey,
    });
    await notify({
      user: uid,
      type: "ingest.committed",
      params: {
        amount: parsed.amount,
        currency: "INR",
        merchant: parsed.merchant,
        direction: parsed.direction,
      },
      link: "/transactions",
    }).catch(() => undefined);
    return { status: "committed", id: String(doc._id), transactionId: String(txn._id), parsed };
  }

  // Not confident enough (ambiguous direction, promo-ish, or low score) → review inbox.
  const category = parsed.direction ? await resolveCategory(uid, parsed.direction, combined) : null;
  const doc = await IngestedPayment.create({ ...base, status: "pending", account, category, dedupeKey });
  await notify({
    user: uid,
    type: "ingest.review",
    params: { amount: parsed.amount, currency: "INR", merchant: parsed.merchant },
    link: "/captured",
  }).catch(() => undefined);
  return { status: "pending", id: String(doc._id), parsed };
}

// ---------------------------------------------------------------------------
// Review inbox operations
// ---------------------------------------------------------------------------

const REVIEW_POPULATE = [
  { path: "account", select: "name color icon currency" },
  { path: "category", select: "name color icon type" },
];

/** Pending captures awaiting review, newest first, plus the pending count. */
export async function listPending(uid: string) {
  const [items, count] = await Promise.all([
    IngestedPayment.find({ user: uid, status: "pending" })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate(REVIEW_POPULATE)
      .lean(),
    IngestedPayment.countDocuments({ user: uid, status: "pending" }),
  ]);
  return { items, count };
}

/** Recently auto-committed captures — for transparency in the inbox. */
export async function listRecentCommitted(uid: string, limit = 20) {
  return IngestedPayment.find({ user: uid, status: "committed" })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate(REVIEW_POPULATE)
    .lean();
}

export interface CommitEdits {
  type?: "income" | "expense";
  amount?: number;
  account?: string;
  category?: string | null;
  date?: Date;
  note?: string;
  payee?: string;
}

/** Confirm a pending capture (with optional edits) → create the real transaction. */
export async function commitPending(uid: string, id: string, edits: CommitEdits) {
  const doc = await IngestedPayment.findOne({ _id: id, user: uid, status: "pending" });
  if (!doc) return null;
  const parsed = doc.parsed;

  const type = edits.type ?? parsed?.direction ?? "expense";
  const amount = edits.amount ?? parsed?.amount ?? null;
  if (amount == null || amount <= 0) return null;
  const account = edits.account ?? (doc.account ? String(doc.account) : await resolveAccount(uid, null).then(String));
  const category =
    edits.category !== undefined
      ? edits.category
      : doc.category
        ? String(doc.category)
        : String(await resolveCategory(uid, type, doc.rawText ?? ""));

  const txn = await Transaction.create({
    user: uid,
    type,
    amount,
    account,
    category,
    date: edits.date ?? parsed?.occurredAt ?? new Date(),
    note: edits.note ?? "",
    payee: edits.payee ?? parsed?.merchant ?? "",
    tags: ["auto"],
  });

  doc.status = "committed";
  doc.transaction = txn._id;
  doc.account = new Types.ObjectId(account);
  if (category) doc.category = new Types.ObjectId(category);
  await doc.save();
  return txn;
}

/** Dismiss a pending capture without creating a transaction. */
export async function dismissPending(uid: string, id: string): Promise<boolean> {
  const res = await IngestedPayment.updateOne(
    { _id: id, user: uid, status: "pending" },
    { $set: { status: "ignored" } }
  );
  return res.matchedCount > 0;
}
