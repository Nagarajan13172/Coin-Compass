import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

describe("Loans — CRUD", () => {
  it("creates a loan (201) with defaults", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/loans", { name: "Home Loan", outstanding: 1_000_000, roi: 8, emi: 15000 });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Home Loan", outstanding: 1_000_000, status: "active", type: "personal" });
  });

  it("lists, updates, and deletes a loan", async () => {
    const u = await createVerifiedUser();
    const l = (await u.session.http.post("/loans", { name: "Car", outstanding: 500000 })).data;
    expect((await u.session.http.get("/loans")).data.some((x: any) => x._id === l._id)).toBe(true);
    const upd = await u.session.http.patch(`/loans/${l._id}`, { emi: 12000 });
    expect(upd.data.emi).toBe(12000);
    expect((await u.session.http.delete(`/loans/${l._id}`)).status).toBe(200);
  });
});

describe("Loans — payments & preclosure", () => {
  it("a part payment reduces the outstanding and auto-closes at zero", async () => {
    const u = await createVerifiedUser();
    const l = (await u.session.http.post("/loans", { name: "Personal", outstanding: 1000, roi: 0 })).data;

    const p1 = await u.session.http.post(`/loans/${l._id}/pay`, { amount: 300 });
    expect(p1.status).toBe(200);
    expect(p1.data).toMatchObject({ outstanding: 700, status: "active" });

    const p2 = await u.session.http.post(`/loans/${l._id}/pay`, { amount: 700 });
    expect(p2.data).toMatchObject({ outstanding: 0, status: "closed" });
  });

  it("preclosure zeroes the balance, closes it, and records the charge", async () => {
    const u = await createVerifiedUser();
    const l = (await u.session.http.post("/loans", { name: "Gold", outstanding: 1000, roi: 0 })).data;
    const res = await u.session.http.post(`/loans/${l._id}/preclose`, { chargePct: 2 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ outstanding: 0, status: "closed" });
    expect(res.data.chargesPaid).toBe(20); // round(1000 × 2%)
  });
});

describe("Loans — validation & ownership", () => {
  it("rejects a missing outstanding balance (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/loans", { name: "NoBalance" })).status).toBe(400);
  });

  it("rejects a non-positive payment (400)", async () => {
    const u = await createVerifiedUser();
    const l = (await u.session.http.post("/loans", { name: "P", outstanding: 1000 })).data;
    expect((await u.session.http.post(`/loans/${l._id}/pay`, { amount: 0 })).status).toBe(400);
  });

  it("404s for another user's loan", async () => {
    const owner = await createVerifiedUser();
    const l = (await owner.session.http.post("/loans", { name: "Mine", outstanding: 100 })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.post(`/loans/${l._id}/pay`, { amount: 10 })).status).toBe(404);
    expect((await stranger.session.http.delete(`/loans/${l._id}`)).status).toBe(404);
  });
});
