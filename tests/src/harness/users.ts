import { newSession, type Session } from "./http";
import { outboxIndex, verificationToken, waitForMail } from "./mail";
import { totpCode } from "./totp";

let seq = 0;

/** A unique, obviously-fake email per call so specs never collide on the shared DB. */
export function uniqueEmail(prefix = "user"): string {
  seq += 1;
  return `${prefix}.${Date.now().toString(36)}.${seq}@test.coincompass.local`;
}

export const DEFAULT_PASSWORD = "Sup3rSecret!";

export interface TestUser {
  session: Session;
  email: string;
  password: string;
}

export function signup(session: Session, email: string, password: string, name?: string) {
  return session.http.post("/auth/signup", { email, password, name });
}

/**
 * End-to-end create a signed-up, email-verified user with an authenticated
 * session (via the real verification-link flow). The workhorse for other suites.
 */
export async function createVerifiedUser(opts: { password?: string; name?: string } = {}): Promise<TestUser> {
  const session = newSession();
  const email = uniqueEmail();
  const password = opts.password ?? DEFAULT_PASSWORD;

  const before = outboxIndex();
  const res = await signup(session, email, password, opts.name);
  if (res.status !== 201) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.data)}`);
  }

  const mail = await waitForMail(email, { since: before, match: /verify-email/ });
  const token = verificationToken(mail);
  const verified = await session.http.post("/auth/verify-email", { token });
  if (verified.status !== 200) {
    throw new Error(`verify-email failed: ${verified.status} ${JSON.stringify(verified.data)}`);
  }

  return { session, email, password };
}

/** Turn on TOTP 2FA for an authenticated, verified user. Returns the secret + backup codes. */
export async function enableTotp(session: Session): Promise<{ secret: string; backupCodes: string[] }> {
  const setup = await session.http.post("/auth/2fa/setup");
  if (setup.status !== 200) throw new Error(`2fa setup failed: ${setup.status} ${JSON.stringify(setup.data)}`);
  const secret: string = setup.data.secret;

  const enable = await session.http.post("/auth/2fa/enable", { code: await totpCode(secret) });
  if (enable.status !== 200) throw new Error(`2fa enable failed: ${enable.status} ${JSON.stringify(enable.data)}`);

  return { secret, backupCodes: enable.data.backupCodes as string[] };
}
