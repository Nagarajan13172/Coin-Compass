import { test, expect } from "@playwright/test";
import { browserSessionCookie, DEFAULT_PASSWORD, seedUserWithData } from "./support/api";

/**
 * A goal can track a wallet instead of counting contributions. The API suite
 * covers the arithmetic and the double-count refusals; this proves the wiring a
 * user actually meets: pick the account in the form, see the wallet's balance as
 * progress, and have "Add to wallet" open a transfer already aimed at it.
 */
test("a goal linked to a wallet shows its balance and takes money by transfer", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);

  await page.goto("/goals");
  await page.getByRole("button", { name: /New goal/i }).click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();

  await form.locator("#goal-name").fill("Emergency Fund");
  await form.locator("#goal-target").fill("500000");
  await form.locator("#goal-account").click();
  await page.getByRole("option", { name: "Savings", exact: true }).click();

  // Linking hands the saved figure to the wallet, so the manual field goes away.
  await expect(form.locator("#goal-saved")).toHaveCount(0);
  await form.getByRole("button", { name: /^(Create|Save)/i }).click();
  await expect(form).toBeHidden();

  // The seeded Savings account holds ₹1,25,000 — that IS the progress, with no
  // contribution ever recorded against the goal.
  await expect(page.getByText("Tracks Savings")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("₹1,25,000 of ₹5,00,000")).toBeVisible();

  // Paying in goes through the wallet: the button opens a transfer aimed at it.
  await page.getByRole("button", { name: /Add to wallet/i }).first().click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("combobox").nth(1)).toHaveText(/Savings/);

  for (const digit of ["5", "0", "0", "0"]) {
    await sheet.getByRole("button", { name: digit, exact: true }).click();
  }
  await sheet.getByRole("button", { name: /^Add transaction$/i }).click();
  await expect(sheet).toBeHidden({ timeout: 15_000 });

  // …and the goal has moved without anyone telling it about the transfer.
  await page.goto("/goals");
  await expect(page.getByText("₹1,30,000 of ₹5,00,000")).toBeVisible({ timeout: 15_000 });
});

/**
 * The sinking-fund case, through the UI: a yearly goal whose due date has passed
 * shows the next round waiting rather than a finished one, and closing a round by
 * hand (for a premium paid early) moves it on.
 */
test("a repeating goal starts its next round on its own", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);

  // A due date in the past — the round that just ended.
  const lastFeb = new Date();
  lastFeb.setMonth(1, 12);
  if (lastFeb.getTime() > Date.now()) lastFeb.setFullYear(lastFeb.getFullYear() - 1);
  const due = lastFeb.toISOString().slice(0, 10);

  await page.goto("/goals");
  await page.getByRole("button", { name: /New goal/i }).click();
  const form = page.getByRole("dialog");
  await form.locator("#goal-name").fill("Car Insurance");
  await form.locator("#goal-target").fill("12000");
  await form.locator("#goal-date").fill(due);
  await form.locator("#goal-repeat").click();
  await page.getByRole("option", { name: /Every year/i }).click();
  await form.getByRole("button", { name: /^(Create|Save)/i }).click();
  await expect(form).toBeHidden();

  // Listing rolls anything overdue: the goal is on its second round, with the
  // finished one kept in its history and the due date a year on.
  await expect(page.getByText("Round 2")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Every year")).toBeVisible();

  // Paying early: close the round by hand and it moves to the third.
  await page.getByRole("button", { name: /Actions for Car Insurance/i }).click();
  await page.getByRole("menuitem", { name: /Close this round/i }).click();
  await expect(page.getByText("Round 3")).toBeVisible({ timeout: 15_000 });
});
