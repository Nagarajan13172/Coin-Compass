import { test, expect } from "@playwright/test";
import {
  DEFAULT_PASSWORD,
  latestVerificationToken,
  outboxIndex,
  seedUserWithTotp,
  seedVerifiedUser,
  uniqueEmail,
} from "./support/api";

/**
 * User Management — browser journeys against the real app + backend.
 * These are the critical happy paths a user actually clicks through; the
 * exhaustive edge-case coverage lives in the API suite.
 */

/** Reliable "we're inside the app now" assertion, independent of dashboard content. */
async function expectInApp(page: import("@playwright/test").Page) {
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Transactions" })).toBeVisible();
}

test("signup → verify email → lands in the app", async ({ page }) => {
  const email = uniqueEmail();
  const before = outboxIndex();

  await page.goto("/signup");
  await page.locator("#name").fill("Ada Lovelace");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEFAULT_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // The app parks unverified users on the verify screen.
  await expect(page).toHaveURL(/\/verify-email/);

  // Follow the real emailed verification link.
  const token = await latestVerificationToken(email, before);
  await page.goto(`/verify-email?token=${encodeURIComponent(token)}`);

  await expectInApp(page);
});

test("existing user signs in with email + password", async ({ page }) => {
  const { email, password } = await seedVerifiedUser();

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expectInApp(page);
});

test("wrong password shows an error and stays on login", async ({ page }) => {
  const { email } = await seedVerifiedUser();

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("2FA account: login prompts for a second factor, backup code lets them in", async ({ page }) => {
  const { email, password, backupCodes } = await seedUserWithTotp();

  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Password alone doesn't sign in — we get the 2FA challenge.
  await expect(page).toHaveURL(/\/login\/2fa/);

  // Switch to the backup-code method (a plain text field) and use one.
  await page.getByRole("button", { name: /use a backup code/i }).click();
  await page.locator("#code").fill(backupCodes[0]);

  await page.getByRole("button", { name: "Verify" }).click();
  // A correct backup code issues a real session and drops us straight into the app.
  await expectInApp(page);
});
