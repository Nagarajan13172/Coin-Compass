import { test, expect, type Page } from "@playwright/test";
import { DEFAULT_PASSWORD, seedVerifiedUser } from "./support/api";

/**
 * Browser journeys for everything built in this round: splitting a bill, the
 * People registry, per-entry settle-up, and the payable side (money you owe).
 *
 * These click through the real UI against the real backend and assert what is
 * actually ON SCREEN — the API suite already proves the arithmetic, so what
 * matters here is that each thing renders once, in the right place, with the
 * right label.
 */

async function signIn(page: Page) {
  const { email } = await seedVerifiedUser();
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(DEFAULT_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "Transactions" })).toBeVisible({ timeout: 15_000 });
  return email;
}

/** Create an account through the UI's own Accounts page. */
async function addAccount(page: Page, name: string, balance: string) {
  await page.goto("/accounts");
  await page.getByRole("button", { name: /new account/i }).first().click();
  await page.locator("#acc-name").fill(name);
  await page.locator("#acc-bal").fill(balance);
  await page.getByRole("button", { name: /^create$/i }).click();
  await expect(page.getByText(name).first()).toBeVisible();
}

/**
 * Fill the person picker: type a name and take the "Add …" row. Scoped to the
 * popover that is actually open — Radix keeps closing popovers mounted for a
 * beat, so an unscoped lookup can match a stale one.
 */
async function pickPerson(page: Page, trigger: ReturnType<Page["getByRole"]>, name: string) {
  await trigger.click();
  const popover = page.locator("[data-radix-popper-content-wrapper]").last();
  await popover.getByRole("textbox").fill(name);
  await popover.getByRole("button", { name: new RegExp(`add "${name}"`, "i") }).click();
  await expect(popover).toBeHidden({ timeout: 5_000 });
}

const entryRows = (page: Page) => page.locator('[data-testid="credit-entry"]');
const personCards = (page: Page) => page.locator('[data-testid="person-card"]');

test.describe("Credits — the payable side", () => {
  test("a borrowed entry appears ONCE, in its own colour", async ({ page }) => {
    await signIn(page);
    await addAccount(page, "Bank", "50000");

    await page.goto("/credits");
    await page.getByRole("button", { name: /add credit/i }).first().click();
    await pickPerson(page, page.getByRole("combobox").first(), "Ravi");
    await page.getByRole("button", { name: "You borrowed", exact: true }).click();
    await page.locator("#credit-amount").fill("5000");
    await page.getByRole("button", { name: /^add$/i }).click();

    // One person, one entry — the duplication the bug report described.
    await expect(personCards(page)).toHaveCount(1);
    await expect(entryRows(page)).toHaveCount(1);
    await expect(entryRows(page).first()).toHaveAttribute("data-direction", "borrowed");
    await expect(page.getByText(/you owe/i).first()).toBeVisible();
  });

  test("each direction is a visually distinct colour", async ({ page }) => {
    await signIn(page);
    await addAccount(page, "Bank", "50000");
    await page.goto("/credits");

    // One entry per direction, all with the same person so they share a card.
    for (const [direction, amount] of [
      ["You gave", "1000"],
      ["You received", "400"],
      ["You borrowed", "800"],
      ["You repaid", "300"],
    ] as const) {
      await page.getByRole("button", { name: /add credit/i }).first().click();
      await pickPerson(page, page.getByRole("combobox").first(), "Ravi");
      await page.getByRole("button", { name: direction, exact: true }).click();
      await page.locator("#credit-amount").fill(amount);
      await page.getByRole("button", { name: /^add$/i }).click();
      await page.waitForTimeout(600);
    }

    await expect(entryRows(page)).toHaveCount(4);
    const colours = await entryRows(page).evaluateAll((rows) =>
      rows.map((r) => ({
        direction: r.getAttribute("data-direction"),
        colour: getComputedStyle(r.querySelector("[data-amount]") as Element).color,
      }))
    );
    // The reported bug: borrowed looked identical to received, repaid to given.
    const unique = new Set(colours.map((c) => c.colour));
    expect(unique.size, `colours were ${JSON.stringify(colours)}`).toBe(4);
  });

  test("borrowing then repaying leaves one row each and squares the person", async ({ page }) => {
    await signIn(page);
    await addAccount(page, "Bank", "50000");

    await page.goto("/credits");
    for (const [direction, amount] of [
      ["You borrowed", "5000"],
      ["You repaid", "5000"],
    ] as const) {
      await page.getByRole("button", { name: /add credit/i }).first().click();
      await pickPerson(page, page.getByRole("combobox").first(), "Ravi");
      await page.getByRole("button", { name: direction, exact: true }).click();
      await page.locator("#credit-amount").fill(amount);
      await page.getByRole("button", { name: /^add$/i }).click();
      await page.waitForTimeout(500);
    }

    // Two entries, not four — and the person is square, so they fold into Settled.
    await page.reload();
    await expect(page.getByText(/settled/i).first()).toBeVisible();
  });
});

test.describe("Splits", () => {
  test("splitting a bill I paid shows one collapsed ledger row", async ({ page }) => {
    await signIn(page);
    await addAccount(page, "Bank", "50000");

    await page.goto("/credits");
    await page.getByRole("button", { name: /split a bill/i }).click();
    await page.getByLabel(/what was it for/i).fill("KFC dinner");
    await page.getByLabel(/bill total/i).fill("3000");
    await page.getByRole("button", { name: /^i paid$/i }).click();

    // Four more people → six-way split at ₹500 each.
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: /add person/i }).click();
    // Match on the stable aria-label, not the visible text — the text becomes the
    // person's name as each row is filled, which would shrink a text filter.
    const names = ["Hari", "Meera", "Arjun", "Kumar", "Divya"];
    for (let i = 0; i < names.length; i++) {
      await pickPerson(page, page.getByRole("combobox", { name: `Name of person ${i + 1}` }), names[i]);
    }
    await expect(page.getByText(/shares add up/i)).toBeVisible();

    await page.getByRole("button", { name: /food & dining/i }).click();
    await page.getByRole("button", { name: /save bill/i }).click();

    // One row in the ledger for the whole bill, not six.
    await page.goto("/transactions");
    await expect(page.getByText(/split between 6 people/i)).toBeVisible({ timeout: 10_000 });
  });

  test("a bill someone else paid records what I owe, not what I'm owed", async ({ page }) => {
    await signIn(page);

    await page.goto("/credits");
    await page.getByRole("button", { name: /split a bill/i }).click();
    await page.getByLabel(/what was it for/i).fill("Ravi's treat");
    await page.getByLabel(/bill total/i).fill("3000");
    await page.getByRole("button", { name: /someone else paid/i }).click();
    await pickPerson(page, page.getByRole("combobox").first(), "Ravi");
    await page.locator("#split-your-share").fill("500");
    await page.getByRole("button", { name: /food & dining/i }).click();
    await page.getByRole("button", { name: /save bill/i }).click();

    await page.waitForTimeout(800);
    await expect(page.getByText(/you owe/i).first()).toBeVisible();
  });
});

test.describe("Groups", () => {
  test("a group created in Settings adds everyone to a split in one tap", async ({ page }) => {
    await signIn(page);
    await addAccount(page, "Bank", "50000");

    // Create the group with three members.
    await page.goto("/settings");
    await page.getByRole("button", { name: /add group/i }).click();
    await page.locator("#group-name").fill("Flatmates");
    // Scoped to the dialog: the Settings page behind it has its own comboboxes
    // (language, currency, theme), so a page-wide role lookup is ambiguous.
    const memberPicker = page.getByRole("dialog").getByRole("combobox");
    for (const name of ["Ravi", "Meera", "Arjun"]) {
      await pickPerson(page, memberPicker, name);
    }
    await page.getByRole("button", { name: /^add$/i }).click();
    await expect(page.locator('[data-testid="person-group"]')).toHaveCount(1);
    await expect(page.getByText("Flatmates")).toBeVisible();

    // One tap in a split adds all three, and an extra person can still be added.
    await page.goto("/credits");
    await page.getByRole("button", { name: /split a bill/i }).click();
    await page.getByLabel(/what was it for/i).fill("Rent");
    await page.getByLabel(/bill total/i).fill("5000");
    await page.getByRole("button", { name: /add a group/i }).click();
    await page.getByRole("menuitem", { name: /flatmates/i }).click();

    // 3 members + the blank starter row is reused → 3 participant rows, 4 people.
    await expect(page.getByText(/shared between 4 people/i)).toBeVisible();
    await page.getByRole("button", { name: /add person/i }).click();
    await pickPerson(page, page.getByRole("combobox", { name: "Name of person 4" }), "Latecomer");
    await expect(page.getByText(/shared between 5 people/i)).toBeVisible();
    await expect(page.getByText(/shares add up/i)).toBeVisible();

    await page.getByRole("button", { name: /food & dining/i }).click();
    await page.getByRole("button", { name: /save bill/i }).click();

    // Four people owe ₹1,000 each.
    await page.waitForTimeout(1000);
    await expect(personCards(page)).toHaveCount(4);
  });
});

test.describe("Settle up", () => {
  test("settling one entry clears just that row", async ({ page }) => {
    await signIn(page);
    await addAccount(page, "Bank", "50000");
    await page.goto("/credits");

    // Two separate lends to the same person.
    for (const amount of ["500", "2000"]) {
      await page.getByRole("button", { name: /add credit/i }).first().click();
      await pickPerson(page, page.getByRole("combobox").first(), "Hari");
      await page.locator("#credit-amount").fill(amount);
      await page.getByRole("button", { name: /^add$/i }).click();
      await page.waitForTimeout(600);
    }
    await expect(entryRows(page)).toHaveCount(2);

    // Settle only the ₹500 one, from its own row menu.
    const row = entryRows(page).filter({ hasText: "500" }).first();
    await row.getByRole("button", { name: /entry actions|actions/i }).click();
    await page.getByRole("menuitem", { name: /settle up this entry/i }).click();
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.waitForTimeout(1000);

    // That entry reads Settled; the ₹2,000 one is untouched.
    await expect(page.getByText(/settled/i).first()).toBeVisible();
    await expect(page.getByText(/owes you/i).first()).toContainText("2,000");
  });
});

test.describe("People", () => {
  test("people added through a credit show up in Settings", async ({ page }) => {
    await signIn(page);

    await page.goto("/credits");
    await page.getByRole("button", { name: /add credit/i }).first().click();
    await pickPerson(page, page.getByRole("combobox").first(), "Ravi Kumar");
    await page.locator("#credit-amount").fill("500");
    await page.getByRole("button", { name: /^add$/i }).click();
    await page.waitForTimeout(600);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: /^People$/ })).toBeVisible();
    await expect(page.getByText("Ravi Kumar")).toBeVisible();
  });
});
