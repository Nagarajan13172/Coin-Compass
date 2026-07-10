import { describe, it, expect } from "vitest";
import type { MetalPrice } from "@/lib/types";
import { findCity, localRate, metalChartSeries, resolveCityRate } from "./cities";

/** A gold snapshot; `retail*` are GRT's scraped counter rates (0 when unavailable). */
function price(over: Partial<MetalPrice> = {}): MetalPrice {
  return {
    metal: "gold",
    currency: "INR",
    date: "2026-07-01",
    pricePerOunce: 350000,
    pricePerGram24k: 12222.44,
    pricePerGram22k: 11203.9,
    pricePerGram18k: 9166.83,
    prevClose: 349000,
    change: 1000,
    changePct: 0.29,
    source: "goldapi",
    fetchedAt: "2026-07-01T06:00:00.000Z",
    retail22k: 0,
    retail24k: 0,
    retail18k: 0,
    retailSource: "",
    ...over,
  };
}

const chennai = findCity("chennai"); // 15.2% premium, GRT source
const mumbai = findCity("mumbai"); // 14.5% premium, no GRT

describe("resolveCityRate", () => {
  it("prefers GRT's actual counter rate for Chennai", () => {
    const r = resolveCityRate(price({ retail22k: 12905, retailSource: "GRT · Chennai" }), chennai);
    expect(r.gram22k).toBe(12905);
    expect(r.approx).toBe(false);
    expect(r.source).toBe("GRT · Chennai");
  });

  it("falls back to spot + premium when GRT is missing", () => {
    const r = resolveCityRate(price({ retail22k: 0 }), chennai);
    expect(r.gram22k).toBeCloseTo(localRate(11203.9, 15.2), 4);
    expect(r.approx).toBe(true);
  });

  it("never uses GRT's Chennai rate for another city", () => {
    const r = resolveCityRate(price({ retail22k: 12905 }), mumbai);
    expect(r.gram22k).toBeCloseTo(localRate(11203.9, 14.5), 4);
    expect(r.approx).toBe(true);
  });
});

describe("metalChartSeries", () => {
  it("plots the same value the headline card shows (GRT, not spot)", () => {
    const grt = price({ date: "2026-07-02", retail22k: 12905 });
    const [point] = metalChartSeries([grt], "gold", chennai);
    expect(point.value).toBe(12905);
    expect(point.value).toBe(resolveCityRate(grt, chennai).gram22k);
    expect(point.value).not.toBe(grt.pricePerGram22k); // the old, wrong series
    expect(point.approx).toBe(false);
  });

  it("mixes real GRT points with estimated ones, flagging the estimates", () => {
    const series = metalChartSeries(
      [
        price({ date: "2026-06-30", retail22k: 0 }), // GRT not captured that day
        price({ date: "2026-07-01", retail22k: 12905 }),
      ],
      "gold",
      chennai
    );
    expect(series.map((p) => p.date)).toEqual(["2026-06-30", "2026-07-01"]);
    expect(series[0].approx).toBe(true);
    expect(series[0].value).toBeCloseTo(localRate(11203.9, 15.2), 4);
    expect(series[1].approx).toBe(false);
    expect(series[1].value).toBe(12905);
  });

  it("plots silver's .999 per-gram rate and ignores the city", () => {
    const silver = price({ metal: "silver", pricePerGram24k: 152.4, retail22k: 9999 });
    const [point] = metalChartSeries([silver], "silver", chennai);
    expect(point.value).toBe(152.4);
    expect(point.approx).toBe(false);
  });

  it("falls back to the spot 22K rate when no city is given", () => {
    const [point] = metalChartSeries([price()], "gold", undefined);
    expect(point.value).toBe(11203.9);
  });
});
