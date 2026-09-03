/**
 * Facts about the build itself.
 *
 * Kept here rather than inside a page because more than one place shows them —
 * Settings, and the footer on every signed-out page — and two copies of a
 * version number is one copy too many.
 */

export const APP_NAME = "CoinCompass";

export const APP_VERSION = "1.0.0";

/** The year the footer claims. Read at render, so it never goes stale. */
export function currentYear(): number {
  return new Date().getFullYear();
}
