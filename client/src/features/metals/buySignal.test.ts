import { describe, it, expect } from "vitest";
import { averagesFor, buySignal, movingAverage, NEUTRAL_BAND_PCT } from "./buySignal";

/** 10 days of rates, newest last — the order the history arrives in. */
const SERIES = [13000, 13100, 13200, 13300, 13400, 13500, 13600, 13700, 13800, 13900];

describe("moving average", () => {
  it("averages the last N points, not the first", () => {
    // The last 3 are 13,700 / 13,800 / 13,900 — recency is the point of it.
    expect(movingAverage(SERIES, 3)).toBe(13800);
  });

  it("uses everything it has when the window is longer than the history", () => {
    expect(movingAverage(SERIES, 90)).toBe(13450); // all ten
    expect(movingAverage([12000], 30)).toBe(12000);
  });

  it("ignores gaps rather than averaging them in as zero", () => {
    // A missing day would otherwise drag the average down and fake a "good buy".
    expect(movingAverage([13000, 0, 13400], 3)).toBe(13200);
    expect(movingAverage([], 7)).toBe(0);
  });
});

describe("buy signal", () => {
  const AVG = 13000;

  it("calls a rate below the band cheap by recent standards", () => {
    const s = buySignal(12800, AVG);
    expect(s.verdict).toBe("good");
    expect(s.diff).toBe(-200);
    expect(s.diffPct).toBe(-1.54);
  });

  it("calls a rate above the band dear", () => {
    expect(buySignal(13400, AVG).verdict).toBe("high");
  });

  it("stays neutral inside the dead band, so noise doesn't flip the verdict", () => {
    // ±0.5% of 13,000 is ±₹65: a ₹40 move either way is not news.
    expect(buySignal(12960, AVG).verdict).toBe("fair");
    expect(buySignal(13040, AVG).verdict).toBe("fair");
    expect(buySignal(AVG, AVG).verdict).toBe("fair");
  });

  it("puts the boundaries where the band says", () => {
    const s = buySignal(13000, AVG, NEUTRAL_BAND_PCT);
    expect(s.goodBelow).toBe(12935);
    expect(s.highAbove).toBe(13065);
    // Exactly on a boundary is still neutral — the zones are strict.
    expect(buySignal(12935, AVG).verdict).toBe("fair");
    expect(buySignal(12934, AVG).verdict).toBe("good");
  });

  it("takes a wider band when asked, for a metal that moves more", () => {
    expect(buySignal(12800, AVG, 2).verdict).toBe("fair"); // −1.54% is inside ±2%
    expect(buySignal(12700, AVG, 2).verdict).toBe("good");
  });

  it("says nothing when there is no history to compare against", () => {
    // A fresh install shouldn't advise anyone off an average of zero.
    expect(buySignal(13000, 0)).toMatchObject({ verdict: "fair", average: 0, diffPct: 0 });
    expect(buySignal(0, 13000)).toMatchObject({ verdict: "fair" });
  });
});

describe("the three windows", () => {
  it("reports 7, 30 and 90 days, shortest first", () => {
    const rows = averagesFor(SERIES);
    expect(rows.map((r) => r.days)).toEqual([7, 30, 90]);
    // Ten rising days: the shorter the window, the higher the average.
    expect(rows[0].average).toBeGreaterThan(rows[2].average);
  });
});
