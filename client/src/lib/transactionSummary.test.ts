import { describe, it, expect } from "vitest";
import { formatMoney, transactionSummary } from "./format";

/**
 * transactionSummary builds the "how much · what · where" line shown in add/delete
 * toasts. Money formatting is delegated to (and separately tested via) formatMoney,
 * so expectations compose it rather than hard-coding ICU output.
 */
const money = (n: number) => formatMoney(n);
const acct = (name: string) => ({ _id: name, name });

describe("transactionSummary", () => {
  it("expense reads amount · category · account from populated refs", () => {
    const line = transactionSummary({
      amount: 500,
      type: "expense",
      account: acct("HDFC Bank"),
      category: { _id: "c1", name: "My Rickshaw" }, // custom name → verbatim
    });
    expect(line).toBe(`${money(500)} · My Rickshaw · HDFC Bank`);
  });

  it("income reads the same shape", () => {
    const line = transactionSummary({
      amount: 1200,
      type: "income",
      account: acct("SBI"),
      category: { _id: "c2", name: "Side Gig" },
    });
    expect(line).toBe(`${money(1200)} · Side Gig · SBI`);
  });

  it("transfer shows the from → to route instead of a category", () => {
    const line = transactionSummary({
      amount: 750,
      type: "transfer",
      account: acct("HDFC"),
      toAccount: acct("ICICI"),
    });
    expect(line).toBe(`${money(750)} · HDFC → ICICI`);
  });

  it("person credit shows the person instead of the bookkeeping category", () => {
    const line = transactionSummary({
      amount: 300,
      type: "expense",
      account: acct("Cash"),
      category: { _id: "c3", name: "Credit Given" },
      credit: { person: "Rahul" },
    });
    expect(line).toBe(`${money(300)} · Rahul · Cash`);
  });

  it("labels a category-less expense 'Uncategorized', matching the row display", () => {
    const line = transactionSummary({ amount: 90, type: "expense", account: acct("HDFC"), category: null });
    expect(line).toBe(`${money(90)} · Uncategorized · HDFC`);
  });

  it("drops a half-populated transfer leg cleanly", () => {
    const line = transactionSummary({ amount: 400, type: "transfer", account: acct("Wallet"), toAccount: "id-only" });
    expect(line).toBe(`${money(400)} · Wallet`);
  });
});
