import { describe, it, expect } from "vitest";
import { parseChartQuote, parseSearchHits } from "./stockPriceService";

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
