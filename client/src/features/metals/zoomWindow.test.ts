import { describe, it, expect } from "vitest";
import {
  fullWindow,
  windowOf,
  windowSize,
  isZoomed,
  zoomAt,
  panBy,
  MIN_POINTS,
} from "./zoomWindow";

/**
 * The chart's zoom is just an index window over the data. These lock the
 * invariants the gestures rely on: focus stays put while zooming, the window
 * never shrinks below a drawable line, and panning clamps at the edges without
 * resizing.
 */
describe("zoomWindow — pure zoom/pan math", () => {
  const TOTAL = 100;

  it("fullWindow spans the whole series and reads as not-zoomed", () => {
    expect(fullWindow(TOTAL)).toEqual({ start: 0, end: 99 });
    expect(isZoomed(fullWindow(TOTAL), TOTAL)).toBe(false);
  });

  it("zooming in around the middle keeps the focus centred", () => {
    const z = zoomAt(fullWindow(TOTAL), TOTAL, 2, 0.5);
    expect(windowSize(z)).toBe(50);
    expect(z).toEqual({ start: 25, end: 74 });
    expect(isZoomed(z, TOTAL)).toBe(true);
  });

  it("zooming in at the right edge pins the right edge", () => {
    const z = zoomAt(fullWindow(TOTAL), TOTAL, 2, 1);
    expect(z.end).toBe(99);
    expect(windowSize(z)).toBe(50);
  });

  it("never shrinks below MIN_POINTS however hard you zoom", () => {
    let z = fullWindow(TOTAL);
    for (let i = 0; i < 20; i++) z = zoomAt(z, TOTAL, 2, 0.5);
    expect(windowSize(z)).toBe(MIN_POINTS);
  });

  it("zooming back out clamps to the full series", () => {
    const zoomed = zoomAt(fullWindow(TOTAL), TOTAL, 4, 0.5);
    const out = zoomAt(zoomed, TOTAL, 0.01, 0.5);
    expect(out).toEqual(fullWindow(TOTAL));
  });

  it("panning slides the window without resizing and clamps at both edges", () => {
    const z = windowOf(40, 20, TOTAL); // [40, 59]
    expect(panBy(z, TOTAL, 10)).toEqual({ start: 50, end: 69 });

    const pastEnd = panBy(z, TOTAL, 1000);
    expect(pastEnd).toEqual({ start: 80, end: 99 }); // pinned to end, size kept
    expect(windowSize(pastEnd)).toBe(20);

    expect(panBy(z, TOTAL, -1000)).toEqual({ start: 0, end: 19 });
  });

  it("degenerate tiny series just shows everything", () => {
    expect(windowOf(0, 5, 1)).toEqual({ start: 0, end: 0 });
    expect(zoomAt(fullWindow(2), 2, 4, 0.5)).toEqual({ start: 0, end: 1 });
  });
});
