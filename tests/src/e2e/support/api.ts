import axios, { type AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";
import { API_URL, OUTBOX_FILE } from "../../harness/config";
import { outboxIndexIn, verificationToken, waitForMailIn } from "../../harness/outbox";
import { totpCode } from "../../harness/totp";

let ipCounter = 500;
let seq = 0;

function nextIp(): string {
  ipCounter += 1;
  return `10.20.${(ipCounter >> 8) & 0xff}.${(ipCounter & 0xff) + 1}`;
}

export function uniqueEmail(prefix = "e2e"): string {
  seq += 1;
  return `${prefix}.${Date.now().toString(36)}.${seq}@test.coincompass.local`;
}

export const DEFAULT_PASSWORD = "Sup3rSecret!";

/** A bare API client (own cookie jar + rate-limit bucket) for E2E preconditions. */
function apiSession(): AxiosInstance {
  const jar = new CookieJar();
  return wrapper(
    axios.create({
      baseURL: API_URL,
      jar,
      withCredentials: true,
      validateStatus: () => true,
      headers: { "X-Forwarded-For": nextIp() },
    })
  );
}

export interface SeededUser {
  email: string;
  password: string;
}

/** Create a verified account directly through the API (used to set up UI tests). */
export async function seedVerifiedUser(): Promise<SeededUser> {
  const http = apiSession();
  const email = uniqueEmail();
  const before = outboxIndexIn(OUTBOX_FILE);

  const res = await http.post("/auth/signup", { email, password: DEFAULT_PASSWORD });
  if (res.status !== 201) throw new Error(`seed signup failed: ${res.status} ${JSON.stringify(res.data)}`);

  const mail = await waitForMailIn(OUTBOX_FILE, email, { since: before, match: /verify-email/ });
  const verified = await http.post("/auth/verify-email", { token: verificationToken(mail) });
  if (verified.status !== 200) throw new Error(`seed verify failed: ${verified.status}`);

  return { email, password: DEFAULT_PASSWORD };
}

/** Create a verified account with TOTP 2FA enabled; returns its backup codes. */
export async function seedUserWithTotp(): Promise<SeededUser & { secret: string; backupCodes: string[] }> {
  const http = apiSession();
  const email = uniqueEmail();
  const before = outboxIndexIn(OUTBOX_FILE);

  const res = await http.post("/auth/signup", { email, password: DEFAULT_PASSWORD });
  if (res.status !== 201) throw new Error(`seed signup failed: ${res.status} ${JSON.stringify(res.data)}`);
  const mail = await waitForMailIn(OUTBOX_FILE, email, { since: before, match: /verify-email/ });
  await http.post("/auth/verify-email", { token: verificationToken(mail) });

  const setup = await http.post("/auth/2fa/setup");
  const secret: string = setup.data.secret;
  const enable = await http.post("/auth/2fa/enable", { code: await totpCode(secret) });
  if (enable.status !== 200) throw new Error(`seed 2fa enable failed: ${enable.status} ${JSON.stringify(enable.data)}`);

  return { email, password: DEFAULT_PASSWORD, secret, backupCodes: enable.data.backupCodes as string[] };
}

/** The most recent verification token emailed to `email` (for the UI signup journey). */
export async function latestVerificationToken(email: string, since: number): Promise<string> {
  const mail = await waitForMailIn(OUTBOX_FILE, email, { since, match: /verify-email/ });
  return verificationToken(mail);
}

export function outboxIndex(): number {
  return outboxIndexIn(OUTBOX_FILE);
}
