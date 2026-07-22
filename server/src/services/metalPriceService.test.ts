import { describe, it, expect } from "vitest";
import { parseGrtRates } from "./metalPriceService";

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
