/**
 * Pure zoom/pan math for the metal history chart. The chart is a categorical
 * time series, so "zoom" is just a visible index window [start, end] (inclusive)
 * into the full data array — shrinking it zooms in, sliding it pans. Keeping the
 * math here (framework-free) makes it unit-testable and leaves the chart
 * component about rendering + gesture wiring only.
 */
export interface ZoomWindow {
  start: number;
  end: number;
}

/** Minimum points kept visible — a line needs at least two. */
export const MIN_POINTS = 2;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

/** The whole series [0 … total-1]. */
export function fullWindow(total: number): ZoomWindow {
  return { start: 0, end: Math.max(0, total - 1) };
}

export function windowSize(w: ZoomWindow): number {
  return w.end - w.start + 1;
}

/** True when the window is narrower than the whole series (i.e. zoomed in). */
export function isZoomed(w: ZoomWindow, total: number): boolean {
  return w.start > 0 || w.end < total - 1;
}

/**
 * Build a valid window of `size` points starting near `start`, clamped so it
 * always sits inside [0, total-1] and is never smaller than MIN_POINTS. A window
 * pushed past an edge keeps its size and pins to that edge (so panning to the end
 * doesn't also shrink the view).
 */
export function windowOf(start: number, size: number, total: number): ZoomWindow {
  if (total <= MIN_POINTS) return fullWindow(total);
  const s = Math.round(clamp(size, MIN_POINTS, total));
  const st = Math.round(clamp(start, 0, total - s));
  return { start: st, end: st + s - 1 };
}

/**
 * Zoom by `factor` around focus fraction `f` (0 = left edge, 1 = right edge of
 * the CURRENT window). factor > 1 zooms in (fewer points), < 1 zooms out. The
 * data index under the focus point stays put, so pinching/scrolling zooms
 * "around" wherever the fingers/cursor are.
 */
export function zoomAt(w: ZoomWindow, total: number, factor: number, f: number): ZoomWindow {
  const size = windowSize(w);
  const focusFrac = clamp(f, 0, 1);
  const focus = w.start + focusFrac * (size - 1);
  const newSize = clamp(size / factor, MIN_POINTS, total);
  const start = focus - focusFrac * (newSize - 1);
  return windowOf(start, newSize, total);
}

/** Slide the window by `deltaPoints` data indices, keeping its size. */
export function panBy(w: ZoomWindow, total: number, deltaPoints: number): ZoomWindow {
  return windowOf(w.start + deltaPoints, windowSize(w), total);
}
