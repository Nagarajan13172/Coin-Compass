import i18n from "@/i18n";
import type { CategoryDatum, CategoryType } from "@/lib/types";

/**
 * Category groups are a REPORTING dimension only: they fold the by-category
 * charts' ~30 flat rows into ~10 readable buckets. They are plain strings on
 * Category.group — no extra Category documents exist for them, so the
 * transaction picker, budgets, and the category list keep seeing only real
 * leaf categories.
 *
 * Keep these slugs in sync with server/src/seed/defaults.ts, the name map in
 * server/src/scripts/backfillCategoryGroups.ts, and i18n/locales/*\/categoryGroups.json.
 */

/** Bucket for rows whose category has no group set. Never stored — derived at rollup. */
export const UNGROUPED = "ungrouped";

export interface GroupMeta {
  icon: string;
  color: string;
  /** Which transaction type the group is offered for in the picker. */
  type: CategoryType;
  /** Display order in pickers and the category list (reports sort by amount instead). */
  order: number;
}

export const GROUP_META: Record<string, GroupMeta> = {
  // — expense —
  food: { icon: "utensils", color: "#F97316", type: "expense", order: 1 },
  transport: { icon: "car", color: "#3B82F6", type: "expense", order: 2 },
  home: { icon: "home", color: "#8B5CF6", type: "expense", order: 3 },
  bills: { icon: "receipt", color: "#EAB308", type: "expense", order: 4 },
  health: { icon: "heart-pulse", color: "#EF4444", type: "expense", order: 5 },
  education: { icon: "graduation-cap", color: "#0EA5E9", type: "expense", order: 6 },
  lifestyle: { icon: "sparkles", color: "#EC4899", type: "expense", order: 7 },
  family_giving: { icon: "heart-handshake", color: "#22C55E", type: "expense", order: 8 },
  savings: { icon: "piggy-bank", color: "#14B8A6", type: "expense", order: 9 },
  debt_transfers: { icon: "credit-card", color: "#A855F7", type: "expense", order: 10 },
  // — income —
  earnings: { icon: "banknote", color: "#22C55E", type: "income", order: 1 },
  returns: { icon: "trending-up", color: "#14B8A6", type: "income", order: 2 },
  inflows: { icon: "coins", color: "#0EA5E9", type: "income", order: 3 },
};

/** Neutral styling for the ungrouped bucket and for custom groups with no children to borrow from. */
const FALLBACK_META = { icon: "tag", color: "#64748B" };

/** Preset groups offered for a category of this type, in display order, plus "other". */
export function groupsForType(type: CategoryType): string[] {
  return [
    ...Object.entries(GROUP_META)
      .filter(([, m]) => m.type === type)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([slug]) => slug),
    "other",
  ];
}

/**
 * Display label for a group slug — translated for the presets, verbatim for a
 * custom group the user typed. Mirrors `categoryLabel` in lib/i18nLabels.ts.
 */
export function groupLabel(slug: string | null | undefined): string {
  if (!slug) return i18n.t(UNGROUPED, { ns: "categoryGroups", defaultValue: "Ungrouped" });
  return i18n.t(slug, { ns: "categoryGroups", defaultValue: slug });
}

export interface GroupDatum {
  /** Group slug, or UNGROUPED for rows whose category has none. */
  key: string;
  name: string;
  color: string;
  icon: string;
  total: number;
  count: number;
  percent: number;
  /** The leaf rows folded into this group, largest first. */
  children: CategoryDatum[];
}

/**
 * Fold leaf category rows into their groups, largest group first.
 *
 * Every input row lands in exactly one group's `children` — rows with no group
 * collect under UNGROUPED rather than being dropped, so the group totals always
 * re-add to the report's grand total. Percentages are recomputed from the totals
 * rather than summed from the children's (already-rounded) percents.
 */
export function rollupByGroup(data: CategoryDatum[]): GroupDatum[] {
  const grandTotal = data.reduce((s, d) => s + d.total, 0);
  const byKey = new Map<string, GroupDatum>();

  for (const row of data) {
    const key = row.group?.trim() || UNGROUPED;
    let g = byKey.get(key);
    if (!g) {
      const meta = GROUP_META[key];
      g = {
        key,
        name: groupLabel(key === UNGROUPED ? null : key),
        // A custom group has no preset styling, so it borrows the look of its
        // biggest child below — this is just the starting value.
        color: meta?.color ?? FALLBACK_META.color,
        icon: meta?.icon ?? FALLBACK_META.icon,
        total: 0,
        count: 0,
        percent: 0, // recomputed from the finished totals below
        children: [],
      };
      byKey.set(key, g);
    }
    g.total += row.total;
    g.count += row.count;
    g.children.push(row);
  }

  const groups = [...byKey.values()];
  for (const g of groups) {
    g.children.sort((a, b) => b.total - a.total);
    const biggest = g.children[0];
    if (!GROUP_META[g.key] && g.key !== UNGROUPED && biggest) {
      g.color = biggest.color;
      g.icon = biggest.icon;
    }
    g.percent = grandTotal > 0 ? Math.round((g.total / grandTotal) * 1000) / 10 : 0;
  }

  return groups.sort((a, b) => b.total - a.total);
}
