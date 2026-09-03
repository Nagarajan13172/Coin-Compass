import { test, expect } from "@playwright/test";
import { browserSessionCookie, DEFAULT_PASSWORD, seedUserWithData } from "./support/api";

/**
 * Setting up a recurring deposit, end to end.
 *
 * The point of the feature is that this takes one form. The API suite proves the
 * rule is built correctly; this proves the promise a user actually meets — that
 * describing the RD on the deposit is the whole job, and that the Recurring page
 * no longer asks for a category, a destination, or an account it would refuse.
 */
test("an RD is set up on the deposit itself, in one form", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);

  await page.goto("/net-worth");
  await page.getByRole("tab", { name: "Assets" }).click();
  await page.getByRole("button", { name: /Add (holding|asset)/i }).first().click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();

  await form.locator("#hold-name").fill("Car Insurance RD");
  // Class stays "Saving"; pick the deposit subtype.
  await form.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /Recurring deposit/i }).click();
  await form.locator("#hold-value").fill("0");

  // The instalment lives here — not on a second screen.
  const instalment = form.getByRole("switch", { name: /Automatic instalment/i });
  await expect(instalment).toBeVisible();
  await instalment.click();

  await form.locator("#inst-amount").fill("1000");
  await form.locator("#inst-account").click();
  await page.getByRole("option", { name: "Savings", exact: true }).click();

  // What will happen, said in a sentence rather than left to be inferred from
  // the mechanism (a transfer into an app-managed bucket).
  await expect(form.getByText(/₹1,000 leaves Savings every month/)).toBeVisible();
  await expect(form.getByText(/a transfer, not a spend/)).toBeVisible();

  await form.getByRole("button", { name: /^(Add|Save)/ }).click();
  await expect(form).toBeHidden();

  // The card says the deposit is being fed, so the automation isn't invisible.
  await expect(page.getByText("Car Insurance RD")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/₹1,000 monthly/)).toBeVisible();

  // One rule exists, and it is the one just described — no second trip needed.
  await page.goto("/recurring");
  await expect(page.getByText("Car Insurance RD").first()).toBeVisible({ timeout: 15_000 });
});

test("the recurring form stops asking for what a deposit rule discards", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);

  // A deposit to aim at.
  await page.goto("/net-worth");
  await page.getByRole("tab", { name: "Assets" }).click();
  await page.getByRole("button", { name: /Add (holding|asset)/i }).first().click();
  const holdingForm = page.getByRole("dialog");
  await holdingForm.locator("#hold-name").fill("Post Office RD");
  await holdingForm.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /Recurring deposit/i }).click();
  await holdingForm.locator("#hold-value").fill("0");
  await holdingForm.getByRole("button", { name: /^(Add|Save)/ }).click();
  await expect(holdingForm).toBeHidden();

  await page.goto("/recurring");
  await page.getByRole("button", { name: /New recurring|Add recurring|New rule/i }).first().click();
  const form = page.getByRole("dialog");
  await expect(form).toBeVisible();

  // The app's own ledgers are not places money can be paid from, and the API
  // refuses them — so they must not be offered.
  await form.getByRole("combobox").first().click();
  await expect(page.getByRole("option", { name: "Money Lent" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Stock Investments" })).toHaveCount(0);
  await page.getByRole("option", { name: "Savings", exact: true }).click();

  // Before linking a deposit, an expense rule still wants a category.
  const categoryLabel = form.locator('label:text-is("Category")');
  await expect(categoryLabel).toBeVisible();

  await form.locator("#rec-holding").click();
  await page.getByRole("option", { name: /Post Office RD/i }).click();

  // Once linked, the category is no longer the user's to choose — it's replaced
  // by a plain statement of where the money goes.
  await expect(categoryLabel).toHaveCount(0);
  await expect(form.getByText(/moves out of the account and into Savings & Deposits/i)).toBeVisible();

  // And the rule saves without one, which is what used to block people.
  await form.locator("#rec-amt").fill("1000");
  await form.getByRole("button", { name: /^(Create|Save|Add)/ }).click();
  await expect(form).toBeHidden();
  await expect(page.getByText("Post Office RD").first()).toBeVisible({ timeout: 15_000 });
});
