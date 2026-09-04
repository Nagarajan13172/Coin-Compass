import { test, expect } from "@playwright/test";
import { browserSessionCookie, DEFAULT_PASSWORD, seedUserWithData } from "./support/api";

/**
 * The Settings page after it stopped being one long scroll.
 *
 * Ten cards became five sections with a rail beside them; the password, the PIN,
 * the authenticator app and the Net Worth passcode became one card instead of
 * three; and the things that only looked interactive — the stat tiles, the
 * region readout — either became interactive or went away.
 */

async function openSettings(page: import("@playwright/test").Page) {
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({
    timeout: 15_000,
  });
  return email;
}

test("the rail reaches every section, and follows the page", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSettings(page);

  const rail = page.getByRole("navigation", { name: /Settings sections/i }).last();
  for (const name of ["Account", "Preferences", "Security", "People & groups", "Data"]) {
    await expect(rail.getByRole("link", { name })).toBeVisible();
  }

  // Jumping lands on the section and the rail says so — the whole point of it.
  await rail.getByRole("link", { name: "Security" }).click();
  await expect(page.getByRole("heading", { name: "Security", level: 2 })).toBeInViewport();
  await expect(rail.getByRole("link", { name: "Security" })).toHaveAttribute(
    "aria-current",
    "true"
  );
  await expect(rail.getByRole("link", { name: "Account" })).not.toHaveAttribute(
    "aria-current",
    "true"
  );

  // And the rail stays put while the page moves past it. The sticky element is
  // the list inside the nav, so measure that rather than its wrapper.
  const list = rail.locator("ul");
  const before = await list.boundingBox();
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  const after = await list.boundingBox();
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThan(4);
  await expect(rail.getByRole("link", { name: "Account" })).toBeInViewport();
});

test("every lock lives in one card, not three", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSettings(page);

  const section = page.locator("section#security");
  // One card. A password, a PIN, an authenticator app and the Net Worth passcode
  // are one concern; they were three cards only because two lived in other files.
  await expect(section.locator("div.rounded-xl.border").first()).toBeVisible();
  for (const row of [
    "Password",
    "PIN lock",
    "Authenticator app",
    "Hide Net Worth behind a passcode",
  ]) {
    await expect(section.getByText(row, { exact: true })).toBeVisible();
  }
  // The old standalone headings are gone from the page entirely.
  await expect(page.getByRole("heading", { name: "Two-factor authentication" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Net Worth lock" })).toHaveCount(0);
});

test("the stat tiles go where they say", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSettings(page);

  // They sat in a card looking like buttons and did nothing when pressed.
  const account = page.locator("section#account");
  await expect(account.getByRole("link", { name: /Accounts/ })).toHaveAttribute(
    "href",
    "/accounts"
  );
  await account.getByRole("link", { name: /Categories/ }).click();
  await expect(page).toHaveURL(/\/categories$/);
});

test("the number format setting actually changes the numbers", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSettings(page);

  // The setting existed in the model and reached formatMoney all along; it just
  // had no control, so a lakh could never be written any other way.
  await page.locator("section#preferences").getByText("Indian · ₹6,62,584").click();
  await page.getByRole("option", { name: /International/ }).click();
  await expect(page.getByText("Number format updated")).toBeVisible({ timeout: 10_000 });

  // The seeded Savings account holds 1,25,000 — or 125,000, which is the point.
  await page.goto("/accounts");
  await expect(page.getByText("₹125,000").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("₹1,25,000")).toHaveCount(0);
});

test("you can sign out from the page people look on", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSettings(page);

  // It was only ever in the sidebar menu, which on a phone is behind "More".
  await page.locator("section#account").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
});

test("a phone gets the sections as a strip, and the identity stays readable", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettings(page);

  const strip = page.getByRole("navigation", { name: /Settings sections/i }).first();
  await expect(strip.getByRole("link", { name: "Account" })).toBeVisible();

  // The email used to be crushed to "e2e.mtn5w6…" by the button beside it.
  const email = page.locator("section#account").getByText(/@test\.coincompass\.local/).first();
  await expect(email).toBeVisible();
  const box = await email.boundingBox();
  expect(box!.width).toBeGreaterThan(180);

  const doc = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(doc).toBeLessThanOrEqual(1);
});
