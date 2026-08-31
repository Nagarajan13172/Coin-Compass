import { test, expect } from "@playwright/test";
import { browserSessionCookie, latestWealthResetCode, outboxIndex, seedUserWithWealthLock } from "./support/api";

/**
 * Net Worth lock — the browser journey for a forgotten passcode. The API suite
 * covers the endpoint's edge cases; this proves the dialog actually wires the
 * "Forgot your passcode?" path through to a visible Net Worth section.
 */

test("forgotten passcode: emailed code sets a new one and reveals Net Worth", async ({ page }) => {
  const { email, password } = await seedUserWithWealthLock();
  // Start from a fresh session — like any new login, it opens in the locked view.
  await page.context().addCookies([await browserSessionCookie(email, password)]);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });

  // Locked: the everyday view doesn't offer Net Worth at all.
  await expect(page.getByRole("link", { name: "Net Worth" })).toHaveCount(0);

  const before = outboxIndex();
  // The sidebar carries its own account menu; drive the top bar's.
  await page.getByRole("banner").getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Unlock Net Worth" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Unlock Net Worth")).toBeVisible();
  await dialog.getByRole("button", { name: "Forgot your passcode?" }).click();

  // The recovery step names where the code went, with the address masked.
  await expect(dialog.getByText(/We emailed a one-time code to .+•+@/)).toBeVisible();

  const code = await latestWealthResetCode(email, before);
  await dialog.locator("#wealth-reset-code").fill(code);
  await dialog.locator("#wealth-new-passcode").fill("brand-new-passcode");
  await dialog.locator("#wealth-confirm-passcode").fill("brand-new-passcode");
  await dialog.getByRole("button", { name: "Reset & unlock" }).click();

  // The account menu stays open behind the dialog, and now offers the reverse
  // action — proof the session came back elevated.
  await expect(page.getByRole("menuitem", { name: "Hide Net Worth" })).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  // And the gated route renders instead of bouncing back to the dashboard.
  await page.goto("/net-worth");
  await expect(page.getByRole("heading", { name: "Net Worth", level: 1 })).toBeVisible();
});
