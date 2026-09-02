import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { MongoClient } from "mongodb";
import { browserSessionCookie, DEFAULT_PASSWORD, seedUserWithData } from "./support/api";
import { MONGO_URI_FILE } from "../harness/config";

/**
 * The Gold page: its rate cards, the chart's two shapes, and the jewellery
 * calculator.
 *
 * Skipped unless METALS_ENABLED is set, because switching the feature on makes
 * the server refresh rates from the live GRT site at boot, and the suite must
 * never depend on someone else's website being up. Run it deliberately:
 *
 *   METALS_ENABLED=true npx playwright test src/e2e/gold-calculator.e2e.ts
 */
test.skip(!process.env.METALS_ENABLED, "metals are off by default so the suite never scrapes GRT");

/** A month of rates, so the page has something to draw and price against. */
async function seedRates() {
  const client = new MongoClient(fs.readFileSync(MONGO_URI_FILE, "utf8"));
  await client.connect();
  const rates = client.db().collection("metalprices");

  const day = (back: number) => {
    const d = new Date();
    d.setDate(d.getDate() - back);
    return d.toISOString().slice(0, 10);
  };
  for (let i = 0; i < 30; i += 1) {
    const drift = Math.round(Math.sin(i / 4) * 180);
    // Upsert: with the feature on, the boot refresh may already hold today's real
    // rate, and (metal, date) is unique.
    const put = (doc: Record<string, unknown>) =>
      rates.updateOne({ metal: doc.metal, date: doc.date }, { $set: doc }, { upsert: true });

    await put({
      metal: "gold",
      currency: "INR",
      date: day(i),
      pricePerOunce: 300000,
      pricePerGram24k: 15213 - drift,
      pricePerGram22k: 11460 - drift,
      pricePerGram18k: 11410 - drift,
      retail22k: 13230 - drift,
      retailSource: "GRT",
      prevClose: 13650 - drift,
      change: i === 0 ? -420 : -50,
      changePct: i === 0 ? -3.13 : -0.4,
      source: "GRT",
      fetchedAt: new Date(),
    });
    await put({
      metal: "silver",
      currency: "INR",
      date: day(i),
      pricePerOunce: 3400,
      pricePerGram24k: 158,
      pricePerGram22k: 145,
      pricePerGram18k: 119,
      prevClose: 160,
      change: -2,
      changePct: -1.25,
      source: "GRT",
      fetchedAt: new Date(),
    });
  }
  await client.close();
}

test("gold page: the day's move in rupees, both chart shapes, and a priced piece", async ({ page }) => {
  test.setTimeout(120_000);
  await seedRates();
  const { email } = await seedUserWithData();
  await page.context().addCookies([await browserSessionCookie(email, DEFAULT_PASSWORD)]);
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto("/gold");

  // A percentage alone doesn't say whether a gram moved ₹40 or ₹400.
  // The gap between the two halves is flex spacing, not a space in the text, so
  // match across it rather than asserting one literal string.
  await expect(page.getByText(/−3\.13%\s*\(−₹420\)/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/−1\.25%\s*\(−₹2\)/)).toBeVisible();

  // The chart draws as an area by default and as bars on request.
  await expect(page.locator(".recharts-area").first()).toBeVisible();
  await page.getByRole("tab", { name: /Bar chart/i }).click();
  await expect(page.locator(".recharts-bar").first()).toBeVisible();
  await expect(page.locator(".recharts-area")).toHaveCount(0);

  // Where today sits against the period's average, in words and in shading.
  await expect(page.getByText(/Good buy|About normal|Dear right now/)).toBeVisible();
  await expect(page.getByText(/the 30-day average/)).toBeVisible();
  await expect(page.getByText(/7d avg/)).toBeVisible();
  await expect(
    page.getByText(/reasonable day to buy|No rush either way|may cost less/)
  ).toBeVisible();
  // Two shaded zones (cheap, dear) plus the average line.
  expect(await page.locator(".recharts-reference-area").count()).toBe(2);
  await expect(page.locator(".recharts-reference-line").first()).toBeAttached();

  // The calculator, at the Chennai counter rate of ₹13,230 a gram (22K).
  // A ring at 20%: metal 13,230 + making 2,646 + GST 3% of 15,876 = ₹16,352.28.
  await page.getByRole("button", { name: /Ring 20%/i }).click();
  await expect(page.getByText("₹16,352.28").first()).toBeVisible();

  // One sovereign is 8 grams — the unit gold is actually bought in here.
  await expect(page.getByText("1 sovereign")).toBeVisible();
  await expect(page.getByText("₹1,30,818.24")).toBeVisible(); // 8 g, all in

  // Both totals are on the row: ₹1,27,008 before GST, ₹1,30,818.24 with it.
  await expect(page.getByText("₹1,27,008")).toBeVisible();

  // Making charges are the swing factor, so they're editable: the same sovereign
  // as a plain bangle costs noticeably less.
  await page.getByRole("button", { name: /Bangle 12%/i }).click();
  await expect(page.getByText("₹1,22,097.02")).toBeVisible();

  // A weight of your own slots into the table in order.
  await page.locator("#calc-grams").fill("12.5");
  await expect(page.getByText("1.56 sovereigns")).toBeVisible();
  await expect(page.getByText("12.5 g")).toBeVisible();

  // GST is a policy that can change, so it's an input too, not a constant.
  await page.locator("#calc-gst").fill("0");
  // formatMoney caps decimals rather than padding them, so this is ".8" not ".80".
  // With no GST the before-GST and total columns agree, hence first().
  await expect(page.getByText("₹1,18,540.8").first()).toBeVisible();

  // Silver is a different metal in more than name: one click on the chart's tab
  // moves the calculator with it, and the weights become silver's own — nobody
  // buys 8 grams of it, and nothing is counted in sovereigns.
  await page.getByRole("tab", { name: "Silver" }).first().click();
  // "1 kg" appears twice now: the silver card's stat and the table row.
  await expect(page.getByText("1 kg").first()).toBeVisible();
  await expect(page.getByText("1 sovereign")).toHaveCount(0);
  await expect(page.getByText("100 g").first()).toBeVisible();
  await page.getByRole("tab", { name: "Gold" }).first().click();
  await expect(page.getByText("1 sovereign")).toBeVisible();

  // On a phone the table is wider than the screen by design: it has to scroll in
  // its own box rather than pushing the page sideways.
  await page.setViewportSize({ width: 360, height: 800 });
  await page.reload();
  await expect(page.getByText("What a piece would cost")).toBeVisible({ timeout: 15_000 });
  const doc = await page.evaluate(() => ({
    vw: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.vw + 1);
});
