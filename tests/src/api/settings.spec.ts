import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

describe("Settings — read & update", () => {
  it("returns settings without secret hashes", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.get("/settings");
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty("baseCurrency");
    expect(res.data.wealthLockEnabled).toBe(false);
    expect(res.data).not.toHaveProperty("pinHash");
    expect(res.data).not.toHaveProperty("wealthPasscodeHash");
  });

  it("updates preferences", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.put("/settings", { baseCurrency: "USD", theme: "dark" });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ baseCurrency: "USD", theme: "dark" });
  });
});

describe("Settings — PIN lock", () => {
  it("sets, verifies (correct & incorrect), and disables the PIN", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/settings/pin", { pin: "1234" })).data).toMatchObject({ pinEnabled: true });
    expect((await u.session.http.post("/settings/pin/verify", { pin: "1234" })).data.ok).toBe(true);
    expect((await u.session.http.post("/settings/pin/verify", { pin: "9999" })).data.ok).toBe(false);
    expect((await u.session.http.delete("/settings/pin")).data).toMatchObject({ pinEnabled: false });
  });

  it("rejects a PIN that isn't 4-8 digits (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/settings/pin", { pin: "12" })).status).toBe(400);
    expect((await u.session.http.post("/settings/pin", { pin: "abcd" })).status).toBe(400);
  });
});

describe("Settings — wealth passcode", () => {
  it("enables then disables the wealth lock", async () => {
    const u = await createVerifiedUser();

    const on = await u.session.http.post("/settings/wealth-passcode", { passcode: "1234" });
    expect(on.status).toBe(200);
    expect(on.data.wealthLockEnabled).toBe(true);
    expect((await u.session.http.get("/settings")).data.wealthLockEnabled).toBe(true);

    // Setting the passcode keeps this session in superadmin mode, so it can disable it.
    const off = await u.session.http.delete("/settings/wealth-passcode");
    expect(off.status).toBe(200);
    expect(off.data.wealthLockEnabled).toBe(false);
  });

  it("rejects a too-short passcode (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/settings/wealth-passcode", { passcode: "12" })).status).toBe(400);
  });
});
