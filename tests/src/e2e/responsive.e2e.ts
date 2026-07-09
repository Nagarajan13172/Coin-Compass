import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_PASSWORD, seedUserWithData } from "./support/api";

/**
 * Guards against horizontal overflow on a phone. The Samsung S24 Ultra reports a
 * ~384px CSS viewport in portrait; anything wider than that makes the page scroll
 * sideways. We visit every authenticated route and assert the document never
 * exceeds the viewport width, logging the offending elements when it does.
 */

// S24 Ultra reports ~384px; 360px covers the many common Android phones; 320px is
// the small-iPhone/legacy floor. Passing at the narrower width implies the wider one.
const WIDTHS = [320, 360, 384];

const ROUTES = [
  "/",
  "/reports",
  "/transactions",
  "/accounts",
  "/budgets",
  "/goals",
  "/net-worth",
  "/loans",
  "/credits",
  "/gold",
  "/calendar",
  "/recurring",
  "/categories",
  "/settings",
];

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEFAULT_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
}

/** Returns { overflow, offenders } for the current page at the current viewport. */
async function measure(page: Page, route: string) {
  return page.evaluate((r) => {
    const vw = document.documentElement.clientWidth;
    const offenders: { route: string; tag: string; cls: string; right: number; width: number }[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || st.position === "fixed") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.width > vw * 2) continue; // skip zero / portal-ish
      if (rect.right > vw + 1 && rect.left >= -1) {
        offenders.push({
          route: r,
          tag: el.tagName.toLowerCase(),
          cls: String(el.className).slice(0, 90),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    }
    offenders.sort((a, b) => b.right - a.right);
    return { overflow: document.documentElement.scrollWidth > vw + 1, vw, offenders: offenders.slice(0, 6) };
  }, route);
}

test("no horizontal overflow on any route at phone width", async ({ page }) => {
  test.setTimeout(180_000); // 3 widths × every route; the default 45s isn't enough
  const { email } = await seedUserWithData();
  await page.setViewportSize({ width: WIDTHS[0], height: 832 });
  await login(page, email);

  const bad: unknown[] = [];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 832 });
    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForTimeout(600); // let charts/animations settle
      const result = await measure(page, route);
      if (result.overflow) bad.push({ width, route, ...result });
    }
  }

  // eslint-disable-next-line no-console
  console.log("OVERFLOW REPORT:\n" + JSON.stringify(bad, null, 2));
  expect(bad, `Routes with horizontal overflow:\n${JSON.stringify(bad, null, 2)}`).toEqual([]);
});
