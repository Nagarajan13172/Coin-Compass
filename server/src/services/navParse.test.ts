import { describe, it, expect } from "vitest";
import { kindFromCategory, normaliseOption, parseNavAll, parseNavDate } from "./navParse";

/** A faithful excerpt of AMFI's file: headings, an AMC, rows, and the awkward bits. */
const FILE = [
  "Scheme Code;ISIN Div Payout/ ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;Net Asset Value;Date",
  "",
  "Open Ended Schemes(Equity Scheme - Flexi Cap Fund)",
  "",
  "PPFAS Mutual Fund",
  "",
  "122639;INF879O01027;-;Parag Parikh Flexi Cap Fund;Direct Plan;Growth;90.7827;31-Aug-2026",
  "153964;-;INF879O01308;Parag Parikh Flexi Cap Fund;Direct Plan;Monthly IDCW Payout;90.7827;31-Aug-2026",
  "",
  "Open Ended Schemes(Debt Scheme - Liquid Fund)",
  "",
  "HDFC Mutual Fund",
  "",
  "119063;INF179K01YV8;-;HDFC Liquid Fund;Regular Plan;Growth Option;4812.3456;31-Aug-2026",
  "999999;INF000000000;-;Freshly Launched Fund;Direct Plan;Growth;N.A.;31-Aug-2026",
].join("\n");

describe("AMFI NAV file — parsing", () => {
  const funds = parseNavAll(FILE);

  it("reads a scheme row into its parts", () => {
    expect(funds[0]).toMatchObject({
      schemeCode: "122639",
      isin: "INF879O01027",
      name: "Parag Parikh Flexi Cap Fund",
      plan: "Direct",
      option: "Growth",
      nav: 90.7827,
    });
    expect(funds[0].navDate).toEqual(new Date(2026, 7, 31));
  });

  it("carries the category and fund house down from the headings above", () => {
    expect(funds[0]).toMatchObject({ fundHouse: "PPFAS Mutual Fund", kind: "equity" });
    expect(funds[2]).toMatchObject({ fundHouse: "HDFC Mutual Fund", kind: "debt" });
  });

  it("keeps the growth and IDCW variants apart — they are different schemes", () => {
    expect(funds[0].option).toBe("Growth");
    expect(funds[1].option).toBe("IDCW");
    expect(funds[1].isin).toBe("INF879O01308"); // falls back to the reinvestment ISIN
    expect(funds[0].schemeCode).not.toBe(funds[1].schemeCode);
  });

  it("skips a scheme with no NAV yet rather than valuing it at zero", () => {
    // A ₹0 NAV would quietly wipe a holding's value.
    expect(funds).toHaveLength(3);
    expect(funds.map((f) => f.schemeCode)).not.toContain("999999");
  });

  it("ignores the header row and blank lines", () => {
    expect(funds.every((f) => /^\d+$/.test(f.schemeCode))).toBe(true);
  });

  it("still reads the older six-column layout, taking plan and option from the name", () => {
    const legacy = [
      "Open Ended Schemes(Equity Scheme - Large Cap Fund)",
      "Axis Mutual Fund",
      "120503;INF846K01131;-;Axis Bluechip Fund - Direct Plan - Growth Option;25.44;31-Aug-2026",
    ].join("\n");
    expect(parseNavAll(legacy)[0]).toMatchObject({
      schemeCode: "120503",
      plan: "Direct",
      option: "Growth",
      nav: 25.44,
    });
  });
});

describe("AMFI NAV file — the small conversions", () => {
  it("reads AMFI's date format, and refuses anything else", () => {
    expect(parseNavDate("01-Jan-2027")).toEqual(new Date(2027, 0, 1));
    expect(parseNavDate("2027-01-01")).toBeNull();
    expect(parseNavDate("31-Xxx-2026")).toBeNull();
  });

  it("classifies a category heading", () => {
    expect(kindFromCategory("Open Ended Schemes(Equity Scheme - Flexi Cap Fund)")).toBe("equity");
    expect(kindFromCategory("Open Ended Schemes(Debt Scheme - Corporate Bond Fund)")).toBe("debt");
    expect(kindFromCategory("Open Ended Schemes(Hybrid Scheme - Balanced Advantage)")).toBe("hybrid");
    expect(kindFromCategory("Solution Oriented Schemes(Retirement Fund)")).toBe("solution");
    expect(kindFromCategory("Other Scheme - Index Funds")).toBe("other");
  });

  it("collapses every spelling of a payout option to IDCW", () => {
    expect(normaliseOption("Dividend Payout")).toBe("IDCW");
    expect(normaliseOption("IDCW Reinvestment")).toBe("IDCW");
    expect(normaliseOption("Growth Option")).toBe("Growth");
  });
});
