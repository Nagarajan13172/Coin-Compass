import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

const FD = { name: "SBI FD", class: "saving", subtype: "fixed_deposit", value: 100000 };

describe("Net Worth — holdings CRUD", () => {
  it("creates a holding (201)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/holdings", FD);
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "SBI FD", class: "saving", subtype: "fixed_deposit", value: 100000 });
  });

  it("lists, updates, and deletes a holding", async () => {
    const u = await createVerifiedUser();
    const h = (await u.session.http.post("/holdings", FD)).data;
    expect((await u.session.http.get("/holdings")).data.some((x: any) => x._id === h._id)).toBe(true);
    const upd = await u.session.http.patch(`/holdings/${h._id}`, { value: 120000 });
    expect(upd.data.value).toBe(120000);
    expect((await u.session.http.delete(`/holdings/${h._id}`)).status).toBe(200);
  });
});

describe("Net Worth — validation & ownership", () => {
  it("rejects a subtype that doesn't match its class (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/holdings", { name: "X", class: "saving", subtype: "stocks", value: 1 });
    expect(res.status).toBe(400);
  });

  it("rejects a negative value (400)", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/holdings", { name: "X", class: "investment", subtype: "stocks", value: -5 });
    expect(res.status).toBe(400);
  });

  it("404s for another user's holding", async () => {
    const owner = await createVerifiedUser();
    const h = (await owner.session.http.post("/holdings", FD)).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.patch(`/holdings/${h._id}`, { value: 1 })).status).toBe(404);
  });
});

describe("Net Worth — trend history", () => {
  it("returns daily snapshots as an array", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.get("/networth/history");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.data)).toBe(true);
  });
});

describe("Net Worth — wealth-lock gating", () => {
  it("open by default, 403 in the everyday view when locked, reopens on unlock", async () => {
    const u = await createVerifiedUser();

    // No passcode set yet → wealth is accessible.
    expect((await u.session.http.get("/holdings")).status).toBe(200);

    // Turn the lock on (this keeps the current session in superadmin mode).
    expect((await u.session.http.post("/settings/wealth-passcode", { passcode: "2468" })).status).toBe(200);
    expect((await u.session.http.get("/holdings")).status).toBe(200);

    // Drop to the everyday view → wealth routes are now locked.
    await u.session.http.post("/auth/lock-wealth");
    expect((await u.session.http.get("/holdings")).status).toBe(403);
    expect((await u.session.http.get("/networth/history")).status).toBe(403);

    // Wrong passcode keeps it locked.
    expect((await u.session.http.post("/auth/unlock-wealth", { passcode: "0000" })).status).toBe(401);
    expect((await u.session.http.get("/holdings")).status).toBe(403);

    // Correct passcode reopens it.
    expect((await u.session.http.post("/auth/unlock-wealth", { passcode: "2468" })).status).toBe(200);
    expect((await u.session.http.get("/holdings")).status).toBe(200);
  });
});
