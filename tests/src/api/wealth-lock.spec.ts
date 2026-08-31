import { describe, it, expect } from "vitest";
import { createVerifiedUser, DEFAULT_PASSWORD, type TestUser } from "../harness/users";
import { newSession, type Session } from "../harness/http";
import { expectNoMail, outboxIndex, waitForMail, wealthResetCode } from "../harness/mail";

const PASSCODE = "s3cret-passcode";
const NEW_PASSCODE = "r3set-passcode";

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

});

describe("Wealth lock — forgotten passcode", () => {
  it("mails a one-time code and swaps in a new passcode, leaving the session unlocked", async () => {
    const u = await lockedUser();
    const before = outboxIndex();

    const req = await u.session.http.post("/auth/wealth-passcode/reset-request");
    expect(req.status, JSON.stringify(req.data)).toBe(200);
    // The address is masked — the client shows where the code went, not the address.
    expect(req.data.email).toMatch(/^..•+@/);

    const code = wealthResetCode(await waitForMail(u.email, { since: before, match: /passcode reset code/ }));
    const done = await u.session.http.post("/auth/wealth-passcode/reset", { code, passcode: NEW_PASSCODE });
    expect(done.status, JSON.stringify(done.data)).toBe(200);

    // Like setting a passcode normally, resetting must not demote the person doing it.
    expect(done.data.user.mode).toBe("superadmin");
    expect(done.data.user.wealthLockEnabled).toBe(true);
    expect((await u.session.http.get("/holdings")).status).toBe(200);
    expect((await u.session.http.get("/networth/history")).status).toBe(200);

    // The code is single-use: replaying it must not re-open the door.
    expect((await u.session.http.post("/auth/wealth-passcode/reset", { code, passcode: "replay-code" })).status).toBe(401);

    // And the lock itself is still on — only the passcode behind it changed.
    expect((await u.session.http.post("/auth/lock-wealth")).status).toBe(200);
    expect((await u.session.http.get("/holdings")).status).toBe(403);
  });

  it("rejects a wrong code, and a too-short passcode, without burning the real one", async () => {
    const u = await lockedUser();
    const before = outboxIndex();
    expect((await u.session.http.post("/auth/wealth-passcode/reset-request")).status).toBe(200);
    const code = wealthResetCode(await waitForMail(u.email, { since: before, match: /passcode reset code/ }));

    const wrong = await u.session.http.post("/auth/wealth-passcode/reset", { code: "000000", passcode: NEW_PASSCODE });
    expect(wrong.status).toBe(401);
    expect((await u.session.http.get("/holdings")).status).toBe(403);

    const short = await u.session.http.post("/auth/wealth-passcode/reset", { code, passcode: "abc" });
    expect(short.status).toBe(400);

    // Neither failure consumed the code, so the real one still works.
    expect((await u.session.http.post("/auth/wealth-passcode/reset", { code, passcode: NEW_PASSCODE })).status).toBe(200);
  });

  it("refuses to mail a code when no lock is enabled", async () => {
    // Otherwise a session could mint itself superadmin before the lock goes on.
    const u = await createVerifiedUser();
    const before = outboxIndex();
    const res = await u.session.http.post("/auth/wealth-passcode/reset-request");
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("WEALTH_LOCK_NOT_ENABLED");
    await expectNoMail(u.email, before);
    expect((await u.session.http.get("/auth/me")).data.user.mode).toBe("user");
  });
});

describe("Wealth lock — brute-force protection", () => {
  // Last in the file on purpose: it deliberately exhausts the per-IP unlock
  // budget, which the server shares across every spec in the run.
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
