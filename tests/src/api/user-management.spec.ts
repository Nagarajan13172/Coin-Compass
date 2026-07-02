import { describe, it, expect } from "vitest";
import { newSession } from "../harness/http";
import { createVerifiedUser, enableTotp, signup, uniqueEmail, DEFAULT_PASSWORD } from "../harness/users";
import { emailOtp, expectNoMail, outboxIndex, resetToken, verificationToken, waitForMail } from "../harness/mail";
import { totpCode } from "../harness/totp";

/**
 * User Management — full black-box coverage against the real running server.
 * Grouped by flow so a failure points straight at the broken area. Every flow
 * exercises the happy path and the important failure paths.
 */

describe("Signup", () => {
  it("creates an account (201), returns an unverified user, and starts a session", async () => {
    const s = newSession();
    const email = uniqueEmail();
    const before = outboxIndex();

    const res = await signup(s, email, DEFAULT_PASSWORD, "Ada Lovelace");

    expect(res.status).toBe(201);
    expect(res.data.user).toMatchObject({ email, emailVerified: false, twoFactorEnabled: false });

    // signup issues a session immediately (gated onto the verify screen client-side)
    const me = await s.http.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.data.user.email).toBe(email);

    // a verification email goes out
    const mail = await waitForMail(email, { since: before, match: /verify-email/ });
    expect(mail.subject).toMatch(/verify/i);
  });

  it("rejects a duplicate email with 409", async () => {
    const email = uniqueEmail();
    await signup(newSession(), email, DEFAULT_PASSWORD);
    const dup = await signup(newSession(), email, DEFAULT_PASSWORD);
    expect(dup.status).toBe(409);
  });

  it("rejects a password shorter than 8 chars with 400", async () => {
    const res = await signup(newSession(), uniqueEmail(), "short");
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email with 400", async () => {
    const res = await signup(newSession(), "not-an-email", DEFAULT_PASSWORD);
    expect(res.status).toBe(400);
  });
});

describe("Email verification", () => {
  it("verifies via the emailed token and flips emailVerified true", async () => {
    const s = newSession();
    const email = uniqueEmail();
    const before = outboxIndex();
    await signup(s, email, DEFAULT_PASSWORD);

    const token = verificationToken(await waitForMail(email, { since: before, match: /verify-email/ }));
    const res = await s.http.post("/auth/verify-email", { token });

    expect(res.status).toBe(200);
    expect(res.data.user.emailVerified).toBe(true);
  });

  it("rejects an invalid/garbage token with 400", async () => {
    const res = await newSession().http.post("/auth/verify-email", { token: "totally-invalid-token" });
    expect(res.status).toBe(400);
  });

  it("resends a verification email that still verifies", async () => {
    const s = newSession();
    const email = uniqueEmail();
    await signup(s, email, DEFAULT_PASSWORD);

    const before = outboxIndex();
    const resend = await s.http.post("/auth/resend-verification");
    expect(resend.status).toBe(200);

    const token = verificationToken(await waitForMail(email, { since: before, match: /verify-email/ }));
    expect((await s.http.post("/auth/verify-email", { token })).status).toBe(200);
  });
});

describe("Signin & session", () => {
  it("signs in a verified user and returns the user", async () => {
    const { email, password } = await createVerifiedUser();
    const s = newSession();

    const res = await s.http.post("/auth/signin", { email, password });
    expect(res.status).toBe(200);
    expect(res.data.user.email).toBe(email);
    expect((await s.http.get("/auth/me")).status).toBe(200);
  });

  it("rejects a wrong password with 401", async () => {
    const { email } = await createVerifiedUser();
    const res = await newSession().http.post("/auth/signin", { email, password: "wrong-password" });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown email with 401 (no account enumeration)", async () => {
    const res = await newSession().http.post("/auth/signin", { email: uniqueEmail(), password: DEFAULT_PASSWORD });
    expect(res.status).toBe(401);
  });

  it("logout clears the session", async () => {
    const { session } = await createVerifiedUser();
    expect((await session.http.get("/auth/me")).status).toBe(200);
    expect((await session.http.post("/auth/logout")).status).toBe(200);
    expect((await session.http.get("/auth/me")).status).toBe(401);
  });
});

describe("Change password", () => {
  it("changes the password; old fails and new works", async () => {
    const { session, email, password } = await createVerifiedUser();
    const next = "N3wStrongPass!";

    const res = await session.http.post("/auth/change-password", { currentPassword: password, newPassword: next });
    expect(res.status).toBe(200);

    expect((await newSession().http.post("/auth/signin", { email, password })).status).toBe(401);
    expect((await newSession().http.post("/auth/signin", { email, password: next })).status).toBe(200);
  });

  it("rejects a wrong current password with 401", async () => {
    const { session } = await createVerifiedUser();
    const res = await session.http.post("/auth/change-password", {
      currentPassword: "not-the-password",
      newPassword: "N3wStrongPass!",
    });
    expect(res.status).toBe(401);
  });
});

describe("Forgot / reset password", () => {
  it("emails a reset link and resets the password", async () => {
    const { email } = await createVerifiedUser();
    const before = outboxIndex();

    expect((await newSession().http.post("/auth/forgot-password", { email })).status).toBe(200);

    const token = resetToken(await waitForMail(email, { since: before, match: /reset-password/ }));
    const next = "Reset3dPass!";
    expect((await newSession().http.post("/auth/reset-password", { token, password: next })).status).toBe(200);
    expect((await newSession().http.post("/auth/signin", { email, password: next })).status).toBe(200);
  });

  it("returns 200 for an unknown email but sends nothing (no enumeration)", async () => {
    const email = uniqueEmail();
    const before = outboxIndex();
    expect((await newSession().http.post("/auth/forgot-password", { email })).status).toBe(200);
    await expectNoMail(email, before);
  });

  it("rejects a bad reset token with 400", async () => {
    const res = await newSession().http.post("/auth/reset-password", { token: "bad-token", password: "Whatever123!" });
    expect(res.status).toBe(400);
  });
});

describe("OAuth providers status", () => {
  it("reports each provider's availability as a boolean", async () => {
    const res = await newSession().http.get("/auth/providers");
    expect(res.status).toBe(200);
    for (const p of ["google", "github", "microsoft", "apple"]) {
      expect(typeof res.data[p]).toBe("boolean");
    }
  });
});

describe("2FA — enrollment", () => {
  it("status is disabled by default", async () => {
    const { session } = await createVerifiedUser();
    const res = await session.http.get("/auth/2fa/status");
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ enabled: false, backupCodesRemaining: 0 });
  });

  it("setup returns an otpauth URL + secret without enabling yet", async () => {
    const { session } = await createVerifiedUser();
    const setup = await session.http.post("/auth/2fa/setup");
    expect(setup.status).toBe(200);
    expect(setup.data.secret).toBeTruthy();
    expect(setup.data.otpauthUrl).toMatch(/^otpauth:\/\//);
    expect((await session.http.get("/auth/2fa/status")).data.enabled).toBe(false);
  });

  it("enable with a valid TOTP turns 2FA on and returns 10 backup codes", async () => {
    const { session } = await createVerifiedUser();
    const { backupCodes } = await enableTotp(session);
    expect(backupCodes).toHaveLength(10);

    const status = await session.http.get("/auth/2fa/status");
    expect(status.data).toMatchObject({ enabled: true, emailFallback: true, backupCodesRemaining: 10 });
  });

  it("enable with a wrong code is rejected 400", async () => {
    const { session } = await createVerifiedUser();
    await session.http.post("/auth/2fa/setup");
    expect((await session.http.post("/auth/2fa/enable", { code: "000000" })).status).toBe(400);
  });

  it("setup again once enabled is rejected 409", async () => {
    const { session } = await createVerifiedUser();
    await enableTotp(session);
    expect((await session.http.post("/auth/2fa/setup")).status).toBe(409);
  });
});

describe("2FA — login challenge", () => {
  async function make2faUser() {
    const user = await createVerifiedUser();
    const { secret, backupCodes } = await enableTotp(user.session);
    return { ...user, secret, backupCodes };
  }

  it("signin on a 2FA account returns requires2fa and issues no session", async () => {
    const { email, password } = await make2faUser();
    const s = newSession();

    const res = await s.http.post("/auth/signin", { email, password });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ requires2fa: true });
    expect(res.data.methods).toEqual(expect.arrayContaining(["totp", "email"]));

    // the pending cookie is NOT a real session...
    expect((await s.http.get("/auth/me")).status).toBe(401);
    // ...but it does describe the challenge
    const pending = await s.http.get("/auth/2fa/pending");
    expect(pending.status).toBe(200);
    expect(pending.data.email).toMatch(/@/);
  });

  it("verify with a correct TOTP completes login and issues a session", async () => {
    const { email, password, secret } = await make2faUser();
    const s = newSession();
    await s.http.post("/auth/signin", { email, password });

    const res = await s.http.post("/auth/2fa/verify", { method: "totp", code: await totpCode(secret) });
    expect(res.status).toBe(200);
    expect(res.data.user.email).toBe(email);
    expect((await s.http.get("/auth/me")).status).toBe(200);
  });

  it("verify with a wrong TOTP is rejected 401", async () => {
    const { email, password } = await make2faUser();
    const s = newSession();
    await s.http.post("/auth/signin", { email, password });
    expect((await s.http.post("/auth/2fa/verify", { method: "totp", code: "000000" })).status).toBe(401);
  });

  it("a backup code logs in once and cannot be reused", async () => {
    const { email, password, backupCodes } = await make2faUser();
    const code = backupCodes[0];

    const s1 = newSession();
    await s1.http.post("/auth/signin", { email, password });
    expect((await s1.http.post("/auth/2fa/verify", { method: "backup", code })).status).toBe(200);

    const s2 = newSession();
    await s2.http.post("/auth/signin", { email, password });
    expect((await s2.http.post("/auth/2fa/verify", { method: "backup", code })).status).toBe(401);
  });

  it("an emailed fallback code completes login", async () => {
    const { email, password } = await make2faUser();
    const s = newSession();
    await s.http.post("/auth/signin", { email, password });

    const before = outboxIndex();
    expect((await s.http.post("/auth/2fa/email")).status).toBe(200);
    const code = emailOtp(await waitForMail(email, { since: before, match: /sign-in code/ }));

    const res = await s.http.post("/auth/2fa/verify", { method: "email", code });
    expect(res.status).toBe(200);
    expect((await s.http.get("/auth/me")).status).toBe(200);
  });
});

describe("2FA — settings & recovery", () => {
  it("toggling email fallback off removes it from the offered methods", async () => {
    const user = await createVerifiedUser();
    await enableTotp(user.session);

    const off = await user.session.http.post("/auth/2fa/email-fallback", { enabled: false });
    expect(off.status).toBe(200);
    expect(off.data.emailFallback).toBe(false);

    const res = await newSession().http.post("/auth/signin", { email: user.email, password: user.password });
    expect(res.data.methods).toEqual(["totp"]);
  });

  it("regenerating backup codes invalidates the old set", async () => {
    const user = await createVerifiedUser();
    const { secret, backupCodes } = await enableTotp(user.session);
    const oldCode = backupCodes[0];

    const regen = await user.session.http.post("/auth/2fa/backup-codes", { code: await totpCode(secret) });
    expect(regen.status).toBe(200);
    expect(regen.data.backupCodes).toHaveLength(10);
    expect(regen.data.backupCodes).not.toContain(oldCode);

    const s = newSession();
    await s.http.post("/auth/signin", { email: user.email, password: user.password });
    expect((await s.http.post("/auth/2fa/verify", { method: "backup", code: oldCode })).status).toBe(401);
  });

  it("disable with the correct password turns 2FA off (no more challenge at login)", async () => {
    const user = await createVerifiedUser();
    await enableTotp(user.session);

    const res = await user.session.http.post("/auth/2fa/disable", { currentPassword: user.password });
    expect(res.status).toBe(200);
    expect((await user.session.http.get("/auth/2fa/status")).data.enabled).toBe(false);

    const login = await newSession().http.post("/auth/signin", { email: user.email, password: user.password });
    expect(login.data).not.toHaveProperty("requires2fa");
    expect(login.data.user.email).toBe(user.email);
  });

  it("disable with a wrong password is rejected 401", async () => {
    const user = await createVerifiedUser();
    await enableTotp(user.session);
    expect((await user.session.http.post("/auth/2fa/disable", { currentPassword: "wrong" })).status).toBe(401);
  });
});

describe("Rate limiting", () => {
  it("throttles repeated sign-in attempts from one IP with 429", async () => {
    const s = newSession({ ip: "203.0.113.7" }); // dedicated bucket
    const email = uniqueEmail();

    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push((await s.http.post("/auth/signin", { email, password: "wrong" })).status);
    }

    // the login limiter allows 10, so the first ten are ordinary 401s and the 11th is throttled
    expect(statuses.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
