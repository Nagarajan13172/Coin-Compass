import { test, expect, type Page } from "@playwright/test";
import { browserSessionCookie, DEFAULT_PASSWORD, seedUserWithData } from "./support/api";

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

/** Seed the session over the API — this test is about layout, not the login form,
 *  and driving the form would spend the browser's shared per-IP sign-in budget. */
async function login(page: Page, email: string) {
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Add transaction" }).first()).toBeVisible({ timeout: 15_000 });
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

/**
 * Overlays are where the worst phone breakage hid: a dialog is a grid, and without
 * an explicit column its track grows to the widest field row, so the box spilled
 * past both screen edges and clipped its own controls. Routes alone never caught
 * it, because the dialog is portalled and clipped.
 */
test("dialogs and sheets fit inside a narrow phone", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.setViewportSize({ width: 320, height: 832 });
  await login(page, email);

  /**
   * How far the overlay's contents exceed it. The box itself is always viewport
   * width, so a too-wide field row shows up as horizontal scroll *inside* the
   * dialog (its own controls scrolled out of reach) rather than a wider box —
   * plus any descendant whose edges land outside the screen.
   */
  async function overlayOverflow() {
    return page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const problems: { kind: string; by: number; text: string }[] = [];
      for (const dialog of Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]'))) {
        const scroll = dialog.scrollWidth - dialog.clientWidth;
        if (scroll > 1) {
          problems.push({ kind: "scrolls sideways", by: scroll, text: (dialog.textContent ?? "").trim().slice(0, 40) });
        }
        const box = dialog.getBoundingClientRect();
        if (box.right > vw + 1 || box.left < -1) {
          problems.push({ kind: "box off-screen", by: Math.round(box.right - vw), text: "" });
        }
        for (const el of Array.from(dialog.querySelectorAll<HTMLElement>("*"))) {
          const st = getComputedStyle(el);
          if (st.display === "none" || st.visibility === "hidden" || st.position === "fixed") continue;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0) continue;
          if (rect.right > box.right + 1 && rect.left >= box.left - 1) {
            problems.push({
              kind: `${el.tagName.toLowerCase()} past the edge`,
              by: Math.round(rect.right - box.right),
              text: (el.textContent ?? "").trim().slice(0, 30),
            });
          }
        }
      }
      return { vw, problems: problems.slice(0, 5) };
    });
  }

  // The split-bill dialog: two-column field rows plus a participant editor.
  await page.goto("/credits");
  await page.getByRole("button", { name: /Split a bill/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(700); // let the open animation settle before measuring
  let m = await overlayOverflow();
  expect(m.problems, `split dialog does not fit ${m.vw}px:
${JSON.stringify(m.problems, null, 2)}`).toEqual([]);
  await page.keyboard.press("Escape");

  // The account form: pickers, a colour grid and an icon search.
  await page.goto("/accounts");
  await page.getByRole("button", { name: /New account/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(700);
  m = await overlayOverflow();
  expect(m.problems, `account dialog does not fit ${m.vw}px:
${JSON.stringify(m.problems, null, 2)}`).toEqual([]);
  await page.keyboard.press("Escape");

  // The add-transaction sheet, opened from the bottom bar's FAB.
  await page.goto("/");
  await page.getByRole("navigation").locator("button").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.waitForTimeout(700);
  m = await overlayOverflow();
  expect(m.problems, `transaction sheet does not fit ${m.vw}px:
${JSON.stringify(m.problems, null, 2)}`).toEqual([]);

  // Nothing in the sheet may push the document sideways either.
  const doc = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.vw + 1);
});

/**
 * The signed-out pages are two columns on a laptop and one on a phone.
 *
 * The brand panel is decoration around the only thing that matters — the form —
 * so it must never be the reason a sign-in page scrolls. It sheds its pieces as
 * the window gets shorter rather than pushing the page taller, and it isn't
 * rendered at all on a phone.
 */
const AUTH_ROUTES = ["/login", "/signup", "/forgot-password"];

test("the signed-out pages fit the window they're given", async ({ page }) => {
  test.setTimeout(120_000);
  // A short laptop, a tall one, and the narrowest width that still splits.
  const SIZES = [
    { width: 1024, height: 600 },
    { width: 1366, height: 660 },
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
  ];

  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const route of AUTH_ROUTES) {
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
      const doc = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(doc.x, `${route} at ${size.width}x${size.height} scrolls sideways`).toBeLessThanOrEqual(1);
      // A short form must never scroll: if it does, the panel beside it grew the
      // page, which is the regression this guards. Signup is excluded because
      // its own fields genuinely outgrow a 600px laptop — that's the form asking
      // for room, not the decoration.
      if (route !== "/signup") {
        expect(doc.y, `${route} at ${size.width}x${size.height} scrolls vertically`).toBeLessThanOrEqual(1);
      }
      // The panel is there to say what the app is; the form is there to be used.
      await expect(page.getByText("CoinCompass").first()).toBeVisible();
    }
  }
});

test("a phone gets the form alone, with no brand panel to scroll past", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15_000 });
  // The headline belongs to the panel, and the panel has no room here.
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
  const doc = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(doc).toBeLessThanOrEqual(1);
});

test("the signed-out pages carry a copyright, panel or no panel", async ({ page }) => {
  const year = new Date().getFullYear();

  const line = new RegExp(`© ${year} CoinCompass`);

  // Both copies are in the DOM at every width — one is hidden by a breakpoint —
  // so each check names the region whose copy should actually be showing.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.getByRole("complementary").getByText(line)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("main").getByText(line)).toBeHidden();

  // On a phone the panel isn't rendered, and that's where most people sign in —
  // so the line has to live under the form too, not only in the panel.
  await page.setViewportSize({ width: 360, height: 780 });
  await page.reload();
  await expect(page.getByRole("main").getByText(line)).toBeVisible({ timeout: 15_000 });
});
