import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * A payment captured from an external source (a phone-notification forwarder like
 * MacroDroid, an SMS, etc.) and POSTed to the ingest webhook. We keep the raw text
 * plus what the parser extracted, so a payment can be:
 *   - auto-committed  → a real Transaction was created (high confidence)
 *   - pending         → queued in the review inbox for the user to confirm/edit
 *   - duplicate       → a matching capture already exists (deduped, not re-posted)
 *   - ignored         → looked like a promo/OTP or was dismissed from review
 *   - unparsed        → no amount could be found
 * The row doubles as an audit log and the dedupe store.
 */
export const INGEST_STATUSES = [
  "committed",
  "pending",
  "duplicate",
  "ignored",
  "unparsed",
] as const;

export type IngestStatus = (typeof INGEST_STATUSES)[number];

const ingestedPaymentSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // Where the capture came from, e.g. "gpay", "phonepe", "sms", "manual".
    source: { type: String, default: "" },
    // The original notification/SMS text the parser ran on (title + body joined).
    rawText: { type: String, default: "" },
    // What the parser extracted. Numbers stay raw for currency formatting later.
    parsed: {
      amount: { type: Number, default: null },
      direction: { type: String, enum: ["income", "expense", null], default: null },
      merchant: { type: String, default: "" },
      accountLast4: { type: String, default: "" },
      upiRef: { type: String, default: "" },
      occurredAt: { type: Date, default: null },
    },
    // 0..1 parser confidence. Auto-commit happens above the threshold.
    confidence: { type: Number, default: 0 },
    status: { type: String, enum: INGEST_STATUSES, required: true },
    // The real transaction created (auto-commit, or after review confirmation).
    transaction: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    // Resolved account/category — pre-filled for the review inbox and used on commit.
    account: { type: Schema.Types.ObjectId, ref: "Account", default: null },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    // Idempotency key (UPI ref, or amount+direction+time bucket) so the same payment
    // arriving twice (notification AND SMS) doesn't post two transactions.
    dedupeKey: { type: String, default: null },
  },
  { timestamps: true }
);

// Newest-first inbox listing and status filters, both user-scoped.
ingestedPaymentSchema.index({ user: 1, createdAt: -1 });
ingestedPaymentSchema.index({ user: 1, status: 1, createdAt: -1 });
// Dedupe lookup: one live capture per (user, dedupeKey).
ingestedPaymentSchema.index({ user: 1, dedupeKey: 1 });

export type IngestedPaymentDoc = InferSchemaType<typeof ingestedPaymentSchema>;
export const IngestedPayment = model("IngestedPayment", ingestedPaymentSchema);
