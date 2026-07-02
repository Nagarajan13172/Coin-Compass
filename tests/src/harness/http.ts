import { inject } from "vitest";
import axios, { type AxiosInstance } from "axios";
import { CookieJar } from "tough-cookie";
import { wrapper } from "axios-cookiejar-support";

let ipCounter = 0;

/**
 * A distinct source IP per session. The server runs `trust proxy`, so req.ip
 * honours X-Forwarded-For — giving each session its own rate-limit bucket, so
 * unrelated tests don't burn each other's login/2FA attempt budgets.
 */
function nextIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 0xff}.${(ipCounter >> 8) & 0xff}.${(ipCounter & 0xff) + 1}`;
}

export interface Session {
  http: AxiosInstance;
  jar: CookieJar;
  ip: string;
}

/**
 * A fresh client with its own cookie jar (so the session/pending cookies persist
 * across calls) and its own rate-limit bucket. Pass a fixed `ip` to deliberately
 * share a bucket — used by the rate-limit test.
 */
export function newSession(opts: { ip?: string } = {}): Session {
  const jar = new CookieJar();
  const ip = opts.ip ?? nextIp();
  const http = wrapper(
    axios.create({
      baseURL: inject("apiUrl"),
      jar,
      withCredentials: true,
      validateStatus: () => true, // we assert on status codes ourselves
      headers: { "X-Forwarded-For": ip },
    })
  );
  return { http, jar, ip };
}
