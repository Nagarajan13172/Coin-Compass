import { Transaction } from "../models/Transaction";

/** How long a soft-deleted transaction stays recoverable before it's purged for good. */
export const TRASH_RETENTION_DAYS = 30;

/**
 * Hard-remove soft-deleted transactions older than the retention window. These are
 * side-effect-free by construction (loan/credit-linked deletes are permanent up front),
 * so there's nothing to reverse — a plain delete is safe. Returns the number purged.
 */
export async function purgeExpiredDeletions(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const res = await Transaction.deleteMany({ deletedAt: { $ne: null, $lte: cutoff } }).setOptions({
    withDeleted: true,
  });
  return res.deletedCount ?? 0;
}
