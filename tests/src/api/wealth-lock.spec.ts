import { describe, it, expect } from "vitest";
import { createVerifiedUser, DEFAULT_PASSWORD, type TestUser } from "../harness/users";
import { newSession, type Session } from "../harness/http";

const PASSCODE = "s3cret-passcode";

/** Sign in as an existing user on a brand-new session (fresh cookie, fresh mode). */
async function signInFresh(email: string): Promise<Session> {
  const s = newSession();
  const res = await s.http.post("/auth/signin", { email, password: DEFAULT_PASSWORD });
  expect(res.status, JSON.stringify(res.data)).toBe(200);
  return s;
}

/** Enable the wealth lock, then drop back to the everyday `user` view. */
async function lockedUser(): Promise<TestUser> {
  const u = await createVerifiedUser();
  expect((await u.session.http.post("/settings/wealth-passcode", { passcode: PASSCODE })).status).toBe(200);
  expect((await u.session.http.post("/auth/lock-wealth")).status).toBe(200);
  return u;
}

describe("Wealth lock — default (off)", () => {
  it("leaves wealth routes open and the session in `user` mode", async () => {
    const u = await createVerifiedUser();
    const me = (await u.session.http.get("/auth/me")).data.user;
    expect(me.mode).toBe("user");
    expect(me.wealthLockEnabled).toBe(false);
    expect((await u.session.http.get("/holdings")).status).toBe(200);
    expect((await u.session.http.get("/networth/history")).status).toBe(200);
  });
});

describe("Wealth lock — engaging it", () => {
  it("keeps the session that set the passcode in superadmin", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/settings/wealth-passcode", { passcode: PASSCODE })).status).toBe(200);
    const me = (await u.session.http.get("/auth/me")).data.user;
    expect(me.mode).toBe("superadmin");
    expect(me.wealthLockEnabled).toBe(true);
    expect((await u.session.http.get("/holdings")).status).toBe(200);
  });

  it("hides wealth routes and zeroes net worth once locked", async () => {
    const u = await lockedUser();
    expect((await u.session.http.get("/auth/me")).data.user.mode).toBe("user");
    expect((await u.session.http.get("/holdings")).status).toBe(403);
    expect((await u.session.http.get("/networth/history")).status).toBe(403);

    const dash = await u.session.http.get("/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.data.summary.netWorth).toBe(0);

    const summary = await u.session.http.get("/reports/summary");
    expect(summary.status).toBe(200);
    expect(summary.data.netWorth).toBe(0);
  });

  it("still shows loans in the everyday view (they are not wealth-gated)", async () => {
    const u = await lockedUser();
    expect((await u.session.http.get("/loans")).status).toBe(200);
  });

  it("starts a fresh login in the locked `user` view", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/settings/wealth-passcode", { passcode: PASSCODE });
    const fresh = await signInFresh(u.email);
    const me = (await fresh.http.get("/auth/me")).data.user;
    expect(me.mode).toBe("user");
    expect(me.wealthLockEnabled).toBe(true);
    expect((await fresh.http.get("/holdings")).status).toBe(403);
  });
});

describe("Wealth lock — unlocking", () => {
  it("rejects the wrong passcode and stays locked", async () => {
    const u = await lockedUser();
    expect((await u.session.http.post("/auth/unlock-wealth", { passcode: "totally-wrong" })).status).toBe(401);
    expect((await u.session.http.get("/holdings")).status).toBe(403);
  });

  it("unlocks with the correct passcode and restores net worth", async () => {
    const u = await lockedUser();
    const ok = await u.session.http.post("/auth/unlock-wealth", { passcode: PASSCODE });
    expect(ok.status).toBe(200);
    expect(ok.data.user.mode).toBe("superadmin");
    expect((await u.session.http.get("/holdings")).status).toBe(200);
    expect((await u.session.http.get("/networth/history")).status).toBe(200);
  });

  it("re-locks on demand", async () => {
    const u = await lockedUser();
    await u.session.http.post("/auth/unlock-wealth", { passcode: PASSCODE });
    expect((await u.session.http.post("/auth/lock-wealth")).status).toBe(200);
    expect((await u.session.http.get("/holdings")).status).toBe(403);
  });

  it("does not let a locked session disable or change the passcode", async () => {
    const u = await lockedUser();
    expect((await u.session.http.delete("/settings/wealth-passcode")).status).toBe(403);
    expect((await u.session.http.post("/settings/wealth-passcode", { passcode: "another-passcode" })).status).toBe(403);
  });

  // --- Regression guards for two ways the lock could be defeated ---

  it("never elevates a session when no passcode is configured", async () => {
    // A session that pre-elevates itself while the lock is OFF would keep wealth
    // access after the lock is later switched on — defeating the feature.
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/auth/unlock-wealth", { passcode: "anything" });
    expect(res.status).toBe(400);
    expect((await u.session.http.get("/auth/me")).data.user.mode).toBe("user");
  });

  it("a session cannot pre-elevate before the lock is switched on", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/auth/unlock-wealth", { passcode: "anything" }); // attempt to pre-elevate

    // Owner turns the lock on from another device.
    const other = await signInFresh(u.email);
    expect((await other.http.post("/settings/wealth-passcode", { passcode: PASSCODE })).status).toBe(200);

    // The pre-elevated session must now be locked out.
    expect((await u.session.http.get("/holdings")).status).toBe(403);
  });

  it("rate-limits repeated wrong passcodes", async () => {
    const u = await lockedUser();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      statuses.push((await u.session.http.post("/auth/unlock-wealth", { passcode: `wrong-${i}` })).status);
    }
    // A low-entropy passcode (4 digits is allowed) must not be brute-forceable.
    expect(statuses).toContain(429);
  });
});
