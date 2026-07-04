import { describe, it, expect } from "vitest";
import {
  ruleTitle,
  classifyDue,
  isBudgetOver,
  monthKey,
  postedDedupeKey,
  endedDedupeKey,
  dueDedupeKey,
  budgetDedupeKey,
  balanceDedupeKey,
} from "./notificationLogic";

describe("notificationLogic.ruleTitle", () => {
  it("prefers payee, then note, then a fallback", () => {
    expect(ruleTitle({ payee: "Landlord", note: "rent" })).toBe("Landlord");
    expect(ruleTitle({ payee: "", note: "rent" })).toBe("rent");
    expect(ruleTitle({ payee: null, note: null })).toBe("Recurring");
    expect(ruleTitle({ payee: "  ", note: "  " })).toBe("Recurring");
  });
});

describe("notificationLogic.classifyDue", () => {
  const now = new Date(2026, 6, 4);
  it("is overdue when the run date is in the past", () => {
    expect(classifyDue(new Date(2026, 6, 1), now)).toBe("overdue");
  });
  it("is due_soon when the run date is now or upcoming", () => {
    expect(classifyDue(new Date(2026, 6, 6), now)).toBe("due_soon");
    expect(classifyDue(now, now)).toBe("due_soon");
  });
});

describe("notificationLogic.isBudgetOver", () => {
  it("is true only when spend passes the limit", () => {
    expect(isBudgetOver(101, 100)).toBe(true);
    expect(isBudgetOver(100, 100)).toBe(false);
    expect(isBudgetOver(50, 100)).toBe(false);
  });
});

describe("notificationLogic dedupe keys", () => {
  const id = "abc123";
  const d = new Date("2026-07-04T00:00:00.000Z");

  it("are stable for the same inputs and vary by input", () => {
    expect(postedDedupeKey(id, d)).toBe(postedDedupeKey(id, d));
    expect(postedDedupeKey(id, d)).not.toBe(postedDedupeKey("other", d));
    expect(endedDedupeKey(id)).toBe("recurring.ended:abc123");
    expect(dueDedupeKey("overdue", id, d)).not.toBe(dueDedupeKey("due_soon", id, d));
    expect(budgetDedupeKey(id, d)).toContain("budget.exceeded:abc123:");
  });

  it("keys the low-balance alert to a monthly bucket", () => {
    expect(monthKey(d)).toBe("2026-07");
    expect(balanceDedupeKey(id, d)).toBe("balance.low:abc123:2026-07");
  });
});
