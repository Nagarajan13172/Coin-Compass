import { describe, it, expect } from "vitest";
import { parseGrtRates, planMetalGapFill, type GapBracket } from "./metalPriceService";

/**
 * GRT embeds rates in a `gold_rate` array whose quotes are backslash-escaped
 * (it lives inside a JS string). This fixture reproduces that exact shape —
 * Gold 24/22/18/14 KT, Platinum, Silver — so the parser is exercised end to end,
 * including the un-escaping step. `esc` mirrors the escaped quotes on the wire.
 */
const esc = (s: string) => s.replace(/"/g, '\\"');
const goldRateArray = (items: string) => `...,"panAmount":200000,${esc(`"gold_rate":[${items}]`)},"show_rating_popup":"1",...`;

const GOLD_ITEMS =
  '{"type":"GOLD","weight":1,"unit":"G","purity":"24 KT","amount":14263,"sort_order":0,"default":false},' +
  '{"type":"GOLD","weight":1,"unit":"G","purity":"22 KT","amount":13065,"sort_order":1,"default":true},' +
  '{"type":"GOLD","weight":1,"unit":"G","purity":"18 KT","amount":10697,"sort_order":2,"default":false},' +
  '{"type":"GOLD","weight":1,"unit":"G","purity":"14 KT","amount":8320,"sort_order":3,"default":false}';
const PLATINUM_ITEM = '{"type":"PLATINUM","weight":1,"unit":"G","purity":null,"amount":6780,"sort_order":4,"default":false}';
const SILVER_ITEM = '{"type":"SILVER","weight":1,"unit":"G","purity":null,"amount":235,"sort_order":5,"default":false}';

describe("parseGrtRates", () => {
  it("reads gold 22/24/18K and silver from the escaped gold_rate array", () => {
    const html = goldRateArray([GOLD_ITEMS, PLATINUM_ITEM, SILVER_ITEM].join(","));
    expect(parseGrtRates(html)).toEqual({
      gram22k: 13065,
      gram24k: 14263,
      gram18k: 10697,
      silverPerGram: 235,
    });
  });

  it("ignores platinum and never mistakes it for silver", () => {
    // Platinum present, silver absent → silver must be 0, not platinum's 6780.
    const html = goldRateArray([GOLD_ITEMS, PLATINUM_ITEM].join(","));
    expect(parseGrtRates(html)?.silverPerGram).toBe(0);
  });

  it("falls back to the header button when the JSON 22K is missing", () => {
    const html = `<button>GOLD 22 KT/1g -  ₹ 13065</button>`;
    const r = parseGrtRates(html);
    expect(r?.gram22k).toBe(13065);
    expect(r?.gram24k).toBe(0); // no array → only the header 22K is recovered
  });

  it("returns null when gold's 22K rate is unreadable", () => {
    expect(parseGrtRates("<html>no rates here</html>")).toBeNull();
  });

  it("returns null when 22K is outside the plausible range", () => {
    const html = goldRateArray('{"type":"GOLD","unit":"G","purity":"22 KT","amount":999}');
    expect(parseGrtRates(html)).toBeNull();
  });

  it("returns null when 24K is not richer than 22K (sanity guard)", () => {
    const html = goldRateArray(
      '{"type":"GOLD","unit":"G","purity":"24 KT","amount":12000},' +
        '{"type":"GOLD","unit":"G","purity":"22 KT","amount":13065}'
    );
    expect(parseGrtRates(html)).toBeNull();
  });

  it("drops an implausible silver figure instead of poisoning the series", () => {
    const html = goldRateArray(
      GOLD_ITEMS + ',{"type":"SILVER","unit":"G","purity":null,"amount":5}'
    );
    expect(parseGrtRates(html)?.silverPerGram).toBe(0);
  });
});

describe("planMetalGapFill", () => {
  const GRT = "GRT · grtjewels.com";

  const goldDay = (date: string, retail22k: number, source: string): GapBracket => ({
    metal: "gold",
    date,
    source,
    retail22k,
    retail24k: Math.round(retail22k * 1.0917),
    pricePerGram22k: retail22k / 1.152,
    pricePerGram24k: (retail22k * 1.0917) / 1.152,
  });

  it("fills only the interior days of a live-bracketed gap, linearly", () => {
    const rows = [goldDay("2026-07-18", 13135, GRT), goldDay("2026-07-22", 13430, GRT)];
    const plan = planMetalGapFill(rows, "gold");
    expect(plan.map((p) => p.date)).toEqual(["2026-07-19", "2026-07-20", "2026-07-21"]);
    // retail22k ramps linearly 13135 → 13430 in whole rupees, never touching the brackets.
    expect(plan.map((p) => p.retail22k)).toEqual([13209, 13283, 13356]);
    // spot fields interpolate without rounding: 19 Jul sits 1/4 of the way across.
    const spot18 = 13135 / 1.152;
    const spot22 = 13430 / 1.152;
    expect(plan[0].pricePerGram22k as number).toBeCloseTo(spot18 + (spot22 - spot18) * 0.25, 6);
    // every filled day is tagged estimated so the UI never shows it as a real rate.
    expect(new Set(plan.map((p) => p.source))).toEqual(new Set(["estimated · gap interpolation"]));
    expect(plan.every((p) => p.retailSource === "Estimated · gap (interpolated)")).toBe(true);
  });

  it("emits nothing for adjacent days (no interior to fill)", () => {
    const rows = [goldDay("2026-07-21", 13356, GRT), goldDay("2026-07-22", 13430, GRT)];
    expect(planMetalGapFill(rows, "gold")).toEqual([]);
  });

  it("never extrapolates past the first/last snapshot or onto a bracket day", () => {
    const rows = [goldDay("2026-07-18", 13135, GRT), goldDay("2026-07-22", 13430, GRT)];
    const dates = planMetalGapFill(rows, "gold").map((p) => p.date);
    expect(dates).not.toContain("2026-07-17"); // before first
    expect(dates).not.toContain("2026-07-23"); // after last
    expect(dates).not.toContain("2026-07-18"); // the brackets themselves
    expect(dates).not.toContain("2026-07-22");
  });

  it("by default leaves gaps that aren't between two live GRT days untouched", () => {
    // Both brackets estimated → the weekday-only history keeps its intended gaps.
    const rows = [goldDay("2026-07-13", 13100, "goldapi.io"), goldDay("2026-07-15", 13160, "goldapi.io")];
    expect(planMetalGapFill(rows, "gold")).toEqual([]);
    // liveOnly:false opts in to bridging them.
    const opened = planMetalGapFill(rows, "gold", { liveOnly: false });
    expect(opened.map((p) => p.date)).toEqual(["2026-07-14"]);
    expect(opened[0].retail22k).toBe(13130); // midpoint of 13100 / 13160
  });

  it("honours `since`, dropping interior days before the cutoff", () => {
    const rows = [goldDay("2026-07-04", 13475, "goldapi.io"), goldDay("2026-07-09", 13130, "goldapi.io")];
    const plan = planMetalGapFill(rows, "gold", { liveOnly: false, since: "2026-07-07" });
    expect(plan.map((p) => p.date)).toEqual(["2026-07-07", "2026-07-08"]);
  });

  it("sorts unordered input before bracketing", () => {
    const rows = [goldDay("2026-07-22", 13430, GRT), goldDay("2026-07-18", 13135, GRT)];
    expect(planMetalGapFill(rows, "gold").map((p) => p.date)).toEqual([
      "2026-07-19",
      "2026-07-20",
      "2026-07-21",
    ]);
  });

  it("zeroes the retail fields for silver (sold .999, no purity tiers)", () => {
    const silverDay = (date: string, g24: number, source: string): GapBracket => ({
      metal: "silver",
      date,
      source,
      pricePerGram24k: g24,
      pricePerGram22k: g24,
      pricePerGram18k: g24,
      pricePerOunce: g24 * 31.1034768,
    });
    const rows = [silverDay("2026-07-18", 235, GRT), silverDay("2026-07-22", 245, GRT)];
    const plan = planMetalGapFill(rows, "silver");
    expect(plan.map((p) => p.date)).toEqual(["2026-07-19", "2026-07-20", "2026-07-21"]);
    expect(plan.map((p) => p.pricePerGram24k)).toEqual([237.5, 240, 242.5]);
    expect(plan.every((p) => p.retail22k === 0 && p.retailSource === "")).toBe(true);
  });
});
