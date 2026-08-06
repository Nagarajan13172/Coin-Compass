import { describe, it, expect } from "vitest";
import { parseChartHistory, parseChartQuote, parseChartSplits, parseSearchHits } from "./stockPriceService";

/**
 * Fixtures are trimmed copies of real upstream responses. The awkward ones —
 * a US listing quoted in USD, and a numeric BSE scrip code resolving to a stale
 * mutual fund — are the reason both parsers exist as separate, pure functions.
 */

const chart = (meta: Record<string, unknown>) => ({ chart: { result: [{ meta }], error: null } });

const NSE_META = {
  currency: "INR",
  symbol: "RELIANCE.NS",
  exchangeName: "NSI",
  fullExchangeName: "NSE",
  instrumentType: "EQUITY",
  regularMarketPrice: 1322.3,
  chartPreviousClose: 1307.8,
  regularMarketDayHigh: 1325.2,
  regularMarketDayLow: 1281.2,
  fiftyTwoWeekHigh: 1611.8,
  fiftyTwoWeekLow: 1249.8,
  regularMarketVolume: 13417350,
  longName: "Reliance Industries Limited",
  shortName: "RELIANCE INDUSTRIES LTD",
  // 2026-08-06 09:09 UTC → 14:39 IST, i.e. mid-session on the 6th.
  regularMarketTime: 1786001975,
};

describe("stockPriceService.parseChartQuote", () => {
  it("reads an NSE equity quote", () => {
    const q = parseChartQuote(chart(NSE_META));
    expect(q).toMatchObject({
      symbol: "RELIANCE.NS",
      currency: "INR",
      close: 1322.3,
      prevClose: 1307.8,
      week52High: 1611.8,
      longName: "Reliance Industries Limited",
    });
  });

  // Upstream happily serves INFY on NYSE in dollars. Letting one through would
  // add dollars to a rupee net worth with no FX conversion anywhere.
  it("rejects an instrument quoted in anything but INR", () => {
    expect(parseChartQuote(chart({ ...NSE_META, symbol: "INFY", currency: "USD" }))).toBeNull();
  });

  // A numeric BSE scrip code resolves to a long-dead mutual fund record with a
  // null currency — which is exactly why symbols may only come from the search
  // endpoint, never from user input.
  it("rejects the stale mutual-fund record a numeric scrip code resolves to", () => {
    const stale = chart({
      currency: null,
      symbol: "500325.BO",
      exchangeName: "YHD",
      instrumentType: "MUTUALFUND",
      fiftyTwoWeekHigh: 2816,
    });
    expect(parseChartQuote(stale)).toBeNull();
  });

  it("returns null for an upstream error payload", () => {
    const err = { chart: { result: null, error: { code: "Not Found", description: "No data found" } } };
    expect(parseChartQuote(err)).toBeNull();
  });

  it("returns null when the price is missing, zero or unusable", () => {
    expect(parseChartQuote(chart({ ...NSE_META, regularMarketPrice: undefined }))).toBeNull();
    expect(parseChartQuote(chart({ ...NSE_META, regularMarketPrice: 0 }))).toBeNull();
    expect(parseChartQuote(chart({ ...NSE_META, regularMarketPrice: "n/a" }))).toBeNull();
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, {}, [], "", { chart: {} }]) {
      expect(parseChartQuote(junk)).toBeNull();
    }
  });

  it("defaults absent optional figures to 0 rather than NaN", () => {
    const q = parseChartQuote(chart({ currency: "INR", symbol: "X.NS", regularMarketPrice: 10 }));
    expect(q).toMatchObject({ prevClose: 0, week52High: 0, volume: 0 });
    expect(Number.isNaN(q!.dayHigh)).toBe(false);
  });

  // The market date comes from the quote's own last-trade time, never from when
  // we happened to fetch it. Upstream keeps serving the previous close over a
  // weekend or a market holiday; dating that as "today" is what would present a
  // stale close as a live quote.
  it("dates the quote by its last trade, in IST", () => {
    expect(parseChartQuote(chart(NSE_META))!.marketDate).toBe("2026-08-06");
  });

  it("uses the IST day, not UTC, at the boundary", () => {
    // 2026-08-06 19:30 UTC is already 01:00 on the 7th in IST.
    const late = parseChartQuote(chart({ ...NSE_META, regularMarketTime: 1786044600 }));
    expect(late!.marketDate).toBe("2026-08-07");
  });

  it("leaves the market date blank when upstream omits the timestamp", () => {
    const noTime = parseChartQuote(chart({ ...NSE_META, regularMarketTime: undefined }));
    expect(noTime!.marketDate).toBe("");
  });
});

describe("stockPriceService.parseChartHistory", () => {
  const history = (timestamp: number[], close: (number | null)[], currency = "INR") => ({
    chart: { result: [{ meta: { currency }, timestamp, indicators: { quote: [{ close }] } }] },
  });

  it("pairs each close with its IST date", () => {
    // 2026-08-04 and 2026-08-05, 03:45 UTC (= 09:15 IST, the open).
    const points = parseChartHistory(history([1785815100, 1785901500], [2400.5, 2391.3]));
    expect(points).toEqual([
      { date: "2026-08-04", close: 2400.5 },
      { date: "2026-08-05", close: 2391.3 },
    ]);
  });

  // Upstream returns parallel arrays with nulls on days a symbol didn't trade.
  // Storing those as zero would draw the position falling off a cliff.
  it("drops days with no close rather than storing zero", () => {
    const points = parseChartHistory(history([1785815100, 1785901500, 1785987900], [2400, null, 2380]));
    expect(points.map((p) => p.close)).toEqual([2400, 2380]);
  });

  it("refuses a series that isn't quoted in INR", () => {
    expect(parseChartHistory(history([1785815100], [2400], "USD"))).toEqual([]);
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, {}, { chart: { result: [{}] } }]) {
      expect(parseChartHistory(junk)).toEqual([]);
    }
  });
});

describe("stockPriceService.parseChartSplits", () => {
  // IRCTC's real 5:1 split — one share became five, so the ratio is 5.
  const IRCTC = {
    chart: {
      result: [
        {
          events: {
            splits: {
              "1635388200": {
                date: 1635388200,
                numerator: 5,
                denominator: 1,
                splitRatio: "5:1",
              },
            },
          },
        },
      ],
    },
  };

  it("reads the ratio as how many shares each old share became", () => {
    const splits = parseChartSplits(IRCTC);
    expect(splits).toHaveLength(1);
    expect(splits[0]).toMatchObject({ date: "2021-10-28", ratio: 5, label: "5:1" });
  });

  it("returns splits oldest-first so they can be applied in order", () => {
    const many = {
      chart: {
        result: [
          {
            events: {
              splits: {
                b: { date: 1733198400, numerator: 2, denominator: 1, splitRatio: "2:1" },
                a: { date: 1635388200, numerator: 5, denominator: 1, splitRatio: "5:1" },
              },
            },
          },
        ],
      },
    };
    expect(parseChartSplits(many).map((s) => s.date)).toEqual(["2021-10-28", "2024-12-03"]);
  });

  // A wrong ratio would silently multiply someone's share count, so anything
  // that doesn't parse cleanly is dropped rather than guessed at.
  it("drops malformed or no-op events instead of guessing", () => {
    const bad = {
      chart: {
        result: [
          {
            events: {
              splits: {
                a: { date: 1635388200, numerator: 0, denominator: 1 },
                b: { date: 1635388201, numerator: 5, denominator: 0 },
                c: { date: 1635388202, numerator: 1, denominator: 1 }, // a 1:1 changes nothing
                d: { date: "nope", numerator: 2, denominator: 1 },
                e: { numerator: 2, denominator: 1 },
              },
            },
          },
        ],
      },
    };
    expect(parseChartSplits(bad)).toEqual([]);
  });

  it("returns nothing when there are no events", () => {
    for (const junk of [null, undefined, {}, { chart: { result: [{ events: {} }] } }]) {
      expect(parseChartSplits(junk)).toEqual([]);
    }
  });
});

describe("stockPriceService.parseSearchHits", () => {
  // The real response for "infosys": the NYSE listing scores highest, a São
  // Paulo DR sits second, and the NSE line — the only tradable one here — third.
  const INFOSYS = {
    quotes: [
      { exchange: "NYQ", symbol: "INFY", quoteType: "EQUITY", shortname: "Infosys Limited", longname: "Infosys Limited" },
      { exchange: "SAO", symbol: "I1FO34.SA", quoteType: "EQUITY", shortname: "INFOSYS LTD DRN" },
      {
        exchange: "NSI",
        symbol: "INFY.NS",
        quoteType: "EQUITY",
        shortname: "INFOSYS LIMITED",
        longname: "Infosys Limited",
        sector: "Technology",
        industry: "Information Technology Services",
      },
    ],
  };

  it("keeps only NSE/BSE listings and strips the exchange suffix", () => {
    const hits = parseSearchHits(INFOSYS);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      symbol: "INFY.NS",
      ticker: "INFY",
      exchange: "NSE",
      sector: "Technology",
    });
  });

  it("maps the .BO suffix to BSE", () => {
    const hits = parseSearchHits({
      quotes: [{ symbol: "RELIANCE.BO", quoteType: "EQUITY", shortname: "RELIANCE" }],
    });
    expect(hits[0]).toMatchObject({ exchange: "BSE", ticker: "RELIANCE" });
  });

  it("drops non-equities on an Indian exchange (indices, ETFs, futures)", () => {
    const hits = parseSearchHits({
      quotes: [
        { symbol: "^NSEI", quoteType: "INDEX", shortname: "NIFTY 50" },
        { symbol: "NIFTYBEES.NS", quoteType: "ETF", shortname: "Nippon ETF" },
      ],
    });
    expect(hits).toHaveLength(0);
  });

  it("falls back to the short name when there is no long name", () => {
    const hits = parseSearchHits({
      quotes: [{ symbol: "ABC.NS", quoteType: "EQUITY", shortname: "ABC Ltd" }],
    });
    expect(hits[0].longName).toBe("ABC Ltd");
  });

  it("survives junk without throwing", () => {
    for (const junk of [null, undefined, {}, { quotes: null }, { quotes: "nope" }]) {
      expect(parseSearchHits(junk)).toEqual([]);
    }
  });
});
