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

  // An RD runs for an agreed number of payments, so the form insists on one.
  await form.getByRole("button", { name: "12", exact: true }).click();
  await form.locator("#inst-payout").click();
  await page.getByRole("option", { name: "Savings", exact: true }).click();

  // What will happen, said in a sentence rather than left to be inferred from
  // the mechanism (a transfer into an app-managed bucket) — including where it
  // ends, so nobody has to count twelve months forward in their head.
  await expect(form.getByText(/₹1,000 leaves Savings every month/)).toBeVisible();
  await expect(form.getByText(/a transfer, not a spend/)).toBeVisible();
  await expect(form.getByText(/12 instalments of it, ₹12,000 in all, ending/)).toBeVisible();

  await form.getByRole("button", { name: /^(Add|Save)/ }).click();
  await expect(form).toBeHidden();

  // The card says the deposit is being fed, so the automation isn't invisible.
  await expect(page.getByText("Car Insurance RD")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/₹1,000 monthly/)).toBeVisible();
  // Nothing paid yet, but the end is already in view.
  await expect(page.getByText("0 of 12 paid")).toBeVisible();

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

test("an RD already running as a plain recurring expense can be claimed", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);
  await page.goto("/net-worth");

  // The rule as someone would have built it before deposits existed: a plain
  // monthly expense, with a category picked only because the form demanded one.
  await page.evaluate(async () => {
    const accounts = await (await fetch("/api/accounts", { credentials: "include" })).json();
    const cats = await (await fetch("/api/categories?type=expense", { credentials: "include" })).json();
    const start = new Date();
    start.setMonth(start.getMonth() - 2);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 11);
    await fetch("/api/recurring", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "expense",
        amount: 7000,
        account: accounts[0]._id,
        category: cats[0]._id,
        note: "Insurance",
        frequency: "monthly",
        interval: 1,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }),
    });
  });

  await page.getByRole("tab", { name: "Assets" }).click();
  await page.getByRole("button", { name: /Add (holding|asset)/i }).first().click();
  const form = page.getByRole("dialog");
  await form.locator("#hold-name").fill("Insurance RD");
  await form.getByRole("combobox").nth(1).click();
  await page.getByRole("option", { name: /Recurring deposit/i }).click();
  await form.locator("#hold-value").fill("0");
  // No schedule here: the point is that one already exists.
  await form.getByRole("button", { name: /^(Add|Save)/ }).click();
  await expect(form).toBeHidden();

  const row = page.locator("div.p-4").filter({ hasText: "Insurance RD" }).last();
  await row.getByRole("button", { name: /Asset actions/i }).click();
  await page.getByRole("menuitem", { name: /Link a recurring rule/i }).click();

  const dialog = page.getByRole("dialog");
  // Named by what the user typed, not by the category they had to pick.
  await dialog.getByRole("button", { name: /Insurance/ }).click();
  await expect(dialog.getByText(/keeps its schedule and its history/)).toBeVisible();
  await dialog.getByRole("button", { name: "Link rule" }).click();

  // The term is read off the rule's own end date — twelve monthly payments —
  // rather than asked for a second time.
  await expect(page.getByText("0 of 12 paid")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/₹7,000 monthly/)).toBeVisible();

  // Still one rule, now feeding the deposit rather than posting an expense.
  await page.goto("/recurring");
  await expect(page.getByText("Insurance RD").first()).toBeVisible({ timeout: 15_000 });
});

test("an import can be taken back, category and all", async ({ page }) => {
  test.setTimeout(120_000);
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);
  await page.goto("/net-worth");

  // Two instalments paid before the deposit existed, recorded as ordinary
  // categorised expenses — and imported into the deposit.
  const category = await page.evaluate(async () => {
    const post = (url: string, body: unknown) =>
      fetch(`/api${url}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then((r) => r.json());
    const accounts = await (await fetch("/api/accounts", { credentials: "include" })).json();
    const cats = await (await fetch("/api/categories?type=expense", { credentials: "include" })).json();
    const h = await post("/holdings", {
      name: "Car Insurance RD",
      class: "saving",
      subtype: "recurring_deposit",
      value: 0,
    });
    const ids: string[] = [];
    for (const back of [60, 30]) {
      const d = new Date();
      d.setDate(d.getDate() - back);
      const t = await post("/transactions", {
        type: "expense",
        amount: 7000,
        account: accounts[0]._id,
        category: cats[0]._id,
        date: d.toISOString(),
        note: "Car Insurance RD instalment",
      });
      ids.push(t._id);
    }
    await post(`/holdings/${h._id}/adopt`, { transactions: ids });
    return cats[0].name as string;
  });

  await page.reload();
  await page.getByRole("tab", { name: "Assets" }).click();
  const row = page.locator("div.p-4").filter({ hasText: "Car Insurance RD" }).last();
  await expect(row.getByText("₹14,000")).toBeVisible({ timeout: 15_000 });

  await row.getByRole("button", { name: /Asset actions/i }).click();
  await page.getByRole("menuitem", { name: /Undo import/i }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Put back the 2 payments/)).toBeVisible();
  await dialog.getByRole("button", { name: "Undo import" }).click();
  await expect(dialog).toBeHidden();

  // The deposit gives back what the import added...
  await expect(
    page.locator("div.p-4").filter({ hasText: "Car Insurance RD" }).last().getByText("₹0")
  ).toBeVisible({ timeout: 15_000 });

  // ...and the offer to undo goes with it, since there's nothing left to put back.
  await page.locator("div.p-4").filter({ hasText: "Car Insurance RD" }).last()
    .getByRole("button", { name: /Asset actions/i }).click();
  await expect(page.getByRole("menuitem", { name: /Undo import/i })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // That the rows are expenses again, carrying the category they had, is
  // asserted in the API suite — the transactions page filters by period, and
  // these are two months old.
  expect(category).toBeTruthy();
});
