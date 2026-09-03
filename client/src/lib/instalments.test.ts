import { describe, it, expect } from "vitest";
import { CADENCES, cadenceToRule, lastInstalment, ruleToCadence } from "./instalments";

/**
 * The cadence a user picks and the (frequency, interval) pair the rule stores
 * are two spellings of the same thing. If they ever disagree, a quarterly RD
 * quietly starts debiting every month — money moving on a schedule nobody chose.
 */

describe("cadence ↔ rule", () => {
  it("survives the round trip, every option", () => {
    for (const c of CADENCES) {
      const rule = cadenceToRule(c.key);
      expect(ruleToCadence(rule.frequency, rule.interval)).toBe(c.key);
    }
  });

  it("spells out the multi-month ones rather than storing a made-up frequency", () => {
    // There is no "quarterly" in the rule model; a quarter is three months.
    expect(cadenceToRule("quarter")).toEqual({ frequency: "monthly", interval: 3 });
    expect(cadenceToRule("halfYear")).toEqual({ frequency: "monthly", interval: 6 });
    expect(cadenceToRule("year")).toEqual({ frequency: "yearly", interval: 1 });
  });

  it("never confuses a quarter with a month", () => {
    expect(ruleToCadence("monthly", 1)).toBe("month");
    expect(ruleToCadence("monthly", 3)).toBe("quarter");
    expect(ruleToCadence("monthly", 6)).toBe("halfYear");
  });

  it("falls back to monthly for a rule this form can't express", () => {
    // A rule built on the Recurring page can say "every 5 days". The deposit
    // form shows the nearest sane thing rather than an empty select — and
    // editing it deliberately rewrites the schedule to what's on screen.
    expect(ruleToCadence("daily", 5)).toBe("month");
    expect(ruleToCadence(undefined, undefined)).toBe("month");
  });

  it("treats a missing interval as one", () => {
    expect(ruleToCadence("weekly")).toBe("week");
    expect(ruleToCadence("yearly")).toBe("year");
  });
});

describe("the last instalment of a term", () => {
  it("counts the first payment as one of them", () => {
    // A 12-month RD starting 3 Sep pays on 3 Sep and then eleven more times, so
    // it finishes on 3 Aug the next year — not 3 Sep. Off by one here and the
    // deposit either stops a month early or takes a thirteenth payment.
    expect(lastInstalment("2026-09-03", "month", 12).toISOString().slice(0, 10)).toBe("2027-08-03");
  });

  it("handles a term of one — a single payment ends the day it starts", () => {
    expect(lastInstalment("2026-09-03", "month", 1).toISOString().slice(0, 10)).toBe("2026-09-03");
  });

  it("steps by the cadence, not by months regardless", () => {
    expect(lastInstalment("2026-09-03", "week", 4).toISOString().slice(0, 10)).toBe("2026-09-24");
    expect(lastInstalment("2026-09-03", "quarter", 4).toISOString().slice(0, 10)).toBe("2027-06-03");
    expect(lastInstalment("2026-09-03", "year", 3).toISOString().slice(0, 10)).toBe("2028-09-03");
  });

  it("treats a nonsense term as a single payment rather than reaching backwards", () => {
    expect(lastInstalment("2026-09-03", "month", 0).toISOString().slice(0, 10)).toBe("2026-09-03");
  });
});
