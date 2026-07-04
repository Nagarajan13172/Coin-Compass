import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/** Turn auto-capture on and return the one-time ingest token. */
async function enableCapture(u: TestUser): Promise<string> {
  const res = await u.session.http.post("/settings/ingest-token");
  expect(res.status).toBe(200);
  expect(res.data.enabled).toBe(true);
  expect(typeof res.data.token).toBe("string");
  return res.data.token as string;
}

/** POST a raw payment notification to the webhook with the token header. */
function postPayment(u: TestUser, token: string, body: Record<string, unknown>) {
  return u.session.http.post("/ingest", body, { headers: { "X-Ingest-Token": token } });
}

describe("Ingest — token auth", () => {
  it("rejects the webhook with no token (401)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/ingest", { text: "You paid ₹100 to Shop" });
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token (401)", async () => {
    const u = await createVerifiedUser();
    await enableCapture(u);
    const res = await postPayment(u, "ing_not-a-real-token", { text: "You paid ₹100 to Shop" });
    expect(res.status).toBe(401);
  });

  it("stops accepting the token once auto-capture is disabled", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);
    expect((await postPayment(u, token, { text: "You paid ₹100 to Shop" })).status).toBe(200);
    expect((await u.session.http.delete("/settings/ingest-token")).status).toBe(200);
    expect((await postPayment(u, token, { text: "You paid ₹100 to Shop" })).status).toBe(401);
  });
});

describe("Ingest — auto-commit (high confidence)", () => {
  it("parses a GPay payment and creates the transaction automatically", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);

    const res = await postPayment(u, token, { text: "You paid ₹1,000 to Blinkit" });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe("committed");
    expect(res.data.transactionId).toBeTruthy();

    // The real transaction exists, as an expense, tagged auto, payee = merchant.
    const txns = (await u.session.http.get("/transactions")).data.items;
    const created = txns.find((t: { payee: string }) => t.payee === "Blinkit");
    expect(created).toBeTruthy();
    expect(created.type).toBe("expense");
    expect(created.amount).toBe(1000);
    expect(created.tags).toContain("auto");

    // A UPI account was auto-created to hold captured payments.
    const accounts = (await u.session.http.get("/accounts")).data;
    expect(accounts.some((a: { type: string }) => a.type === "upi")).toBe(true);
  });

  it("parses an incoming payment as income", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);
    const res = await postPayment(u, token, { text: "You received ₹2,000 from Ravi" });
    expect(res.data.status).toBe("committed");
    const txns = (await u.session.http.get("/transactions")).data.items;
    const created = txns.find((t: { payee: string }) => t.payee === "Ravi");
    expect(created.type).toBe("income");
    expect(created.amount).toBe(2000);
  });
});

describe("Ingest — dedupe", () => {
  it("does not post the same UPI reference twice", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);
    const text = "Rs.500.00 debited from A/c XX1234 to VPA shop@ybl UPI Ref 999888777666 -SBI";

    const first = await postPayment(u, token, { text });
    expect(first.data.status).toBe("committed");
    const second = await postPayment(u, token, { text });
    expect(second.data.status).toBe("duplicate");

    // Only one transaction for that amount.
    const txns = (await u.session.http.get("/transactions")).data.items;
    const matches = txns.filter((t: { amount: number }) => t.amount === 500);
    expect(matches.length).toBe(1);
  });
});

describe("Ingest — review inbox", () => {
  it("queues an ambiguous payment, then commits it into a transaction", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);

    // Amount present but no debit/credit keyword → can't tell direction → review.
    const res = await postPayment(u, token, { text: "₹750 transaction on card ending 4321" });
    expect(res.data.status).toBe("pending");

    const inbox = (await u.session.http.get("/ingest/inbox")).data;
    expect(inbox.count).toBe(1);
    const pending = inbox.pending[0];
    expect(pending.parsed.amount).toBe(750);

    // Confirm it (defaults to an expense, using the pre-resolved account).
    const commit = await u.session.http.post(`/ingest/${pending._id}/commit`, { type: "expense" });
    expect(commit.status).toBe(201);
    expect(commit.data.amount).toBe(750);

    // Inbox is now empty; the transaction is in the ledger.
    expect((await u.session.http.get("/ingest/inbox")).data.count).toBe(0);
    const txns = (await u.session.http.get("/transactions")).data.items;
    expect(txns.some((t: { amount: number }) => t.amount === 750)).toBe(true);
  });

  it("dismisses a pending capture without creating a transaction", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);
    const res = await postPayment(u, token, { text: "₹321 transaction pending" });
    const inbox = (await u.session.http.get("/ingest/inbox")).data;
    const id = inbox.pending[0]._id;

    expect((await u.session.http.delete(`/ingest/${id}`)).status).toBe(200);
    expect((await u.session.http.get("/ingest/inbox")).data.count).toBe(0);
    const txns = (await u.session.http.get("/transactions")).data.items;
    expect(txns.some((t: { amount: number }) => t.amount === 321)).toBe(false);
  });

  it("records but never posts an amount-less notification", async () => {
    const u = await createVerifiedUser();
    const token = await enableCapture(u);
    const res = await postPayment(u, token, { text: "Your OTP for login is 123456" });
    expect(res.data.status).toBe("unparsed");
    expect((await u.session.http.get("/ingest/inbox")).data.count).toBe(0);
  });
});

describe("Ingest — ownership", () => {
  it("won't let another user commit or dismiss your pending capture (404)", async () => {
    const owner = await createVerifiedUser();
    const token = await enableCapture(owner);
    await postPayment(owner, token, { text: "₹555 transaction on card" });
    const id = (await owner.session.http.get("/ingest/inbox")).data.pending[0]._id;

    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.post(`/ingest/${id}/commit`, {})).status).toBe(404);
    expect((await stranger.session.http.delete(`/ingest/${id}`)).status).toBe(404);
    // The owner's inbox is untouched.
    expect((await owner.session.http.get("/ingest/inbox")).data.count).toBe(1);
  });
});
