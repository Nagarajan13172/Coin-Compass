import { describe, it, expect } from "vitest";
import { GROUP_META, UNGROUPED, groupsForType, rollupByGroup } from "./categoryGroups";
import type { CategoryDatum } from "@/lib/types";

/**
 * rollupByGroup folds the by-category report rows into their reporting groups.
 * It is the only place a chart's numbers get re-derived, so these specs assert
 * the invariants that keep the grouped view honest — conservation of the total,
 * every row accounted for exactly once, and percentages recomputed rather than
 * summed from the children's already-rounded ones.
 */

const row = (
  name: string,
  total: number,
  group: string | null = null,
  extra: Partial<CategoryDatum> = {}
): CategoryDatum => ({
  categoryId: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  color: "#000000",
  icon: "tag",
  group,
  total,
  count: 1,
  percent: 0,
  ...extra,
});

describe("rollupByGroup — conservation", () => {
  it("group totals re-add to the grand total exactly", () => {
    const data = [
      row("Food & Dining", 13324, "food"),
      row("Groceries", 4174, "food"),
      row("Fuel", 1906.69, "transport"),
      row("Misc", 15859, "other"),
    ];
    const grand = data.reduce((s, d) => s + d.total, 0);
    const groups = rollupByGroup(data);
    expect(groups.reduce((s, g) => s + g.total, 0)).toBe(grand);
  });

  it("puts every input row in exactly one group's children", () => {
    const data = [
      row("Rent", 1500, "home"),
      row("Maid", 3000, "home"),
      row("Health", 1610, "health"),
      row("Stray", 10),
    ];
    const children = rollupByGroup(data).flatMap((g) => g.children);
    expect(children).toHaveLength(data.length);
    expect(new Set(children.map((c) => c.categoryId)).size).toBe(data.length);
    for (const d of data) expect(children).toContain(d);
  });

  it("sums the transaction counts of its children", () => {
    const groups = rollupByGroup([
      row("Food & Dining", 100, "food", { count: 12 }),
      row("Tea & Snacks", 50, "food", { count: 7 }),
    ]);
    expect(groups[0].count).toBe(19);
  });
});

describe("rollupByGroup — ungrouped bucket", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace", "   "],
  ])("treats a %s group as ungrouped rather than dropping the row", (_label, group) => {
    const groups = rollupByGroup([row("Orphan", 500, group as string | null)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNGROUPED);
    expect(groups[0].total).toBe(500);
  });

  it("keeps ungrouped rows separate from real groups", () => {
    const groups = rollupByGroup([row("Rent", 100, "home"), row("Orphan", 100)]);
    expect(groups.map((g) => g.key).sort()).toEqual(["home", UNGROUPED].sort());
  });
});

describe("rollupByGroup — percentages", () => {
  it("recomputes the group percent from totals instead of summing rounded child percents", () => {
    // Three equal children: each rounds to 33.3%, which sums to 99.9 — the group
    // must still report 100%.
    const groups = rollupByGroup([
      row("A", 1, "food", { percent: 33.3 }),
      row("B", 1, "food", { percent: 33.3 }),
      row("C", 1, "food", { percent: 33.3 }),
    ]);
    expect(groups[0].percent).toBe(100);
  });

  it("reports 0% (not NaN) when everything totals zero", () => {
    const groups = rollupByGroup([row("A", 0, "food"), row("B", 0, "home")]);
    expect(groups.every((g) => g.percent === 0)).toBe(true);
  });

  it("rounds to one decimal place", () => {
    const groups = rollupByGroup([row("A", 1, "food"), row("B", 2, "home")]);
    const food = groups.find((g) => g.key === "food")!;
    expect(food.percent).toBe(33.3);
  });
});

describe("rollupByGroup — ordering", () => {
  it("returns groups largest first", () => {
    const groups = rollupByGroup([
      row("Rent", 1500, "home"),
      row("Food & Dining", 13324, "food"),
      row("Health", 1610, "health"),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["food", "health", "home"]);
  });

  it("returns each group's children largest first", () => {
    const groups = rollupByGroup([
      row("Tea & Snacks", 628, "food"),
      row("Food & Dining", 13324, "food"),
      row("Groceries", 4174, "food"),
    ]);
    expect(groups[0].children.map((c) => c.name)).toEqual([
      "Food & Dining",
      "Groceries",
      "Tea & Snacks",
    ]);
  });
});

describe("rollupByGroup — styling", () => {
  it("uses the preset icon and color for a known group", () => {
    const groups = rollupByGroup([row("Rent", 100, "home", { color: "#ff0000", icon: "bath" })]);
    expect(groups[0].icon).toBe(GROUP_META.home.icon);
    expect(groups[0].color).toBe(GROUP_META.home.color);
  });

  it("borrows the biggest child's look for a custom group with no preset", () => {
    const groups = rollupByGroup([
      row("Small", 10, "my_bucket", { color: "#111111", icon: "cake" }),
      row("Big", 90, "my_bucket", { color: "#222222", icon: "gem" }),
    ]);
    expect(groups[0].color).toBe("#222222");
    expect(groups[0].icon).toBe("gem");
  });

  it("labels a custom group with its own slug rather than blanking it", () => {
    const groups = rollupByGroup([row("X", 1, "my_bucket")]);
    expect(groups[0].name).toBe("my_bucket");
  });
});

describe("rollupByGroup — empty input", () => {
  it("returns no groups", () => {
    expect(rollupByGroup([])).toEqual([]);
  });
});

describe("groupsForType", () => {
  it("offers only the presets declared for that type, plus Other", () => {
    const expense = groupsForType("expense");
    const income = groupsForType("income");
    expect(expense).toContain("food");
    expect(expense).not.toContain("earnings");
    expect(income).toContain("earnings");
    expect(income).not.toContain("food");
    expect(expense.at(-1)).toBe("other");
    expect(income.at(-1)).toBe("other");
  });

  it("lists presets in their declared order", () => {
    const expense = groupsForType("expense").filter((g) => g !== "other");
    const orders = expense.map((g) => GROUP_META[g].order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
