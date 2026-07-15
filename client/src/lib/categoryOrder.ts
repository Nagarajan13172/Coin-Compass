import type { Category } from "@/lib/types";

// Show the most-used categories in their own band only once the full list is
// long enough that scanning it is a chore. Below this, a flat A–Z list is faster.
export const FREQUENT_SPLIT_THRESHOLD = 8;
// Cap on the "Frequently used" band — enough to cover daily spends without the
// band churning so much that muscle memory breaks.
export const FREQUENT_MAX = 6;

export interface FrequencySplit {
  /** Most-used categories (by recent usageCount), highest first. */
  frequent: Category[];
  /** Everything not in `frequent`, in the input's original order. */
  rest: Category[];
}

/**
 * Split an already-A–Z-sorted category list into a "frequently used" band and
 * the alphabetical remainder — the shared ordering used by both the category
 * picker (transaction sheet) and the category filter (transaction list).
 *
 * Returns an empty `frequent` (and `rest` === the input) when the list is too
 * short to be worth a separate band, or when nothing has usage yet — a clean
 * cold start where the plain A–Z list is best.
 *
 * Relies on the input already being A–Z: `Array.prototype.sort` is stable, so
 * ranking by usage keeps equal-usage categories in their alphabetical order and
 * no explicit tiebreak is needed.
 */
export function splitByFrequency(
  categories: Category[],
  { max = FREQUENT_MAX, threshold = FREQUENT_SPLIT_THRESHOLD }: { max?: number; threshold?: number } = {}
): FrequencySplit {
  if (categories.length <= threshold) return { frequent: [], rest: categories };

  const frequent = categories
    .filter((c) => (c.usageCount ?? 0) > 0)
    .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
    .slice(0, max);

  if (frequent.length === 0) return { frequent: [], rest: categories };

  const frequentIds = new Set(frequent.map((c) => c._id));
  return { frequent, rest: categories.filter((c) => !frequentIds.has(c._id)) };
}
