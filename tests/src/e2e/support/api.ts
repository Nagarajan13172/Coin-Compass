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

/** Create a verified user pre-loaded with an account, categories and transactions
 *  so charts/reports actually render (needed to catch responsive-layout bugs). */
export async function seedUserWithData(): Promise<SeededUser> {
  const http = apiSession();
  const email = uniqueEmail();
  const before = outboxIndexIn(OUTBOX_FILE);

  const res = await http.post("/auth/signup", { email, password: DEFAULT_PASSWORD });
  if (res.status !== 201) throw new Error(`seed signup failed: ${res.status} ${JSON.stringify(res.data)}`);
  const mail = await waitForMailIn(OUTBOX_FILE, email, { since: before, match: /verify-email/ });
  await http.post("/auth/verify-email", { token: verificationToken(mail) });

  const acc = (await http.post("/accounts", { name: "Main", initialBalance: 50000 })).data;
  const acc2 = (await http.post("/accounts", { name: "Savings", initialBalance: 120000 })).data;
  const cats = (await http.get("/categories?type=expense")).data as any[];
  const now = Date.now();
  for (let i = 0; i < 14; i += 1) {
    await http.post("/transactions", {
      type: i % 4 === 0 ? "income" : "expense",
      amount: 250 + i * 137,
      account: acc._id,
      category: i % 4 === 0 ? undefined : cats[i % cats.length]?._id,
      date: new Date(now - i * 6 * 3600 * 1000).toISOString(),
      note: `Sample transaction number ${i} with a longish note`,
    });
  }
  await http.post("/budgets", { category: cats[0]._id, amount: 5000 });
  await http.post("/goals", { name: "Emergency Fund", targetAmount: 100000, savedAmount: 35000 });
  const loan = (await http.post("/loans", { name: "Home Loan", outstanding: 450000, roi: 9, emi: 12000 })).data;
  await http.post("/credits", { person: "Rahul", direction: "given", amount: 2500 });
  await http.post("/holdings", { name: "SBI Fixed Deposit", class: "saving", subtype: "fixed_deposit", value: 200000 });
  await http.post("/transactions", { type: "transfer", amount: 5000, account: acc._id, toAccount: acc2._id });

  // Recurring rules due *today* so the dashboard's "Due soon" card renders — the
  // long category name + Monthly badge + amount + Post button is a tight mobile row.
  const monthAgo = new Date(now - 30 * 86400 * 1000).toISOString();
  const today = new Date(now).toISOString();
  await http.post("/recurring", {
    type: "expense",
    amount: 2100,
    account: acc._id,
    category: cats.find((c) => c.name === "Cash Withdrawal")?._id ?? cats[0]._id,
    frequency: "monthly",
    interval: 1,
    startDate: monthAgo,
    nextRun: today,
  });
  await http.post("/recurring", {
    type: "expense",
    amount: 60000,
    account: acc._id,
    category: cats[1]?._id,
    loan: loan._id, // adds the loan badge — the two-badge case from the screenshots
    frequency: "monthly",
    interval: 1,
    startDate: monthAgo,
    nextRun: today,
  });

  return { email, password: DEFAULT_PASSWORD };
}

/** The most recent verification token emailed to `email` (for the UI signup journey). */
export async function latestVerificationToken(email: string, since: number): Promise<string> {
  const mail = await waitForMailIn(OUTBOX_FILE, email, { since, match: /verify-email/ });
  return verificationToken(mail);
}

export function outboxIndex(): number {
  return outboxIndexIn(OUTBOX_FILE);
}
