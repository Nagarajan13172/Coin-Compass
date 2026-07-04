import { describe, it, expect } from "vitest";
import { parsePaymentText, AUTO_COMMIT_THRESHOLD } from "./ingestService";

/** Would this parse auto-commit? (mirrors the service's decision, minus DB state) */
function wouldAutoCommit(p: ReturnType<typeof parsePaymentText>): boolean {
  return p.confidence >= AUTO_COMMIT_THRESHOLD && p.direction != null && !p.promo;
}

describe("parsePaymentText — GPay notifications", () => {
  it("parses 'You paid ₹1,000.00 to Blinkit' as a confident expense", () => {
    const p = parsePaymentText("You paid ₹1,000.00 to Blinkit");
    expect(p.amount).toBe(1000);
    expect(p.direction).toBe("expense");
    expect(p.merchant).toBe("Blinkit");
    expect(wouldAutoCommit(p)).toBe(true);
  });

  it("parses '₹500 paid to Zomato'", () => {
    const p = parsePaymentText("₹500 paid to Zomato");
    expect(p.amount).toBe(500);
    expect(p.direction).toBe("expense");
    expect(p.merchant).toBe("Zomato");
  });

  it("parses 'You received ₹2,000 from John Doe' as income", () => {
    const p = parsePaymentText("You received ₹2,000 from John Doe");
    expect(p.amount).toBe(2000);
    expect(p.direction).toBe("income");
    expect(p.merchant).toBe("John Doe");
    expect(wouldAutoCommit(p)).toBe(true);
  });

  it("handles Indian digit grouping (₹1,00,000)", () => {
    const p = parsePaymentText("You paid ₹1,00,000 to Landlord");
    expect(p.amount).toBe(100000);
  });
});

describe("parsePaymentText — bank / UPI SMS", () => {
  it("parses a debit SMS with A/c and UPI ref", () => {
    const p = parsePaymentText(
      "Rs.1000.00 debited from A/c XX1234 on 04-Jul-25 to VPA merchant@ybl UPI Ref 412345678901 -SBI"
    );
    expect(p.amount).toBe(1000);
    expect(p.direction).toBe("expense");
    expect(p.accountLast4).toBe("1234");
    expect(p.upiRef).toBe("412345678901");
    expect(p.merchant.toLowerCase()).toContain("merchant@ybl");
    expect(p.confidence).toBeGreaterThanOrEqual(AUTO_COMMIT_THRESHOLD);
  });

  it("parses a card spend at a merchant", () => {
    const p = parsePaymentText("INR 1,299.00 spent on your HDFC Bank Card XX4321 at AMAZON");
    expect(p.amount).toBe(1299);
    expect(p.direction).toBe("expense");
    expect(p.accountLast4).toBe("4321");
    expect(p.merchant).toBe("AMAZON");
  });

  it("parses a credit SMS as income", () => {
    const p = parsePaymentText("Rs 250.00 credited to A/c XX1234 -HDFC");
    expect(p.amount).toBe(250);
    expect(p.direction).toBe("income");
  });
});

describe("parsePaymentText — things that must NOT auto-post", () => {
  it("returns amount null (confidence 0) when there's no money figure", () => {
    const p = parsePaymentText("Your OTP for login is 123456. Do not share it.");
    expect(p.amount).toBeNull();
    expect(p.confidence).toBe(0);
    expect(wouldAutoCommit(p)).toBe(false);
  });

  it("flags a cashback/offer promo and won't auto-commit", () => {
    const p = parsePaymentText("Congratulations! You won ₹500 cashback. Offer ends soon.");
    expect(p.promo).toBe(true);
    expect(wouldAutoCommit(p)).toBe(false);
  });

  it("leaves direction ambiguous when no debit/credit keyword is present", () => {
    const p = parsePaymentText("₹500 transaction on your card ending 4321");
    expect(p.amount).toBe(500);
    expect(p.direction).toBeNull();
    expect(wouldAutoCommit(p)).toBe(false);
  });
});
