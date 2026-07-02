import fs from "node:fs";
import type { CapturedMail } from "./mailSink";

export type { CapturedMail } from "./mailSink";

/**
 * File-backed reader for the captured mail outbox. Pure (no test-runner deps) so
 * both the Vitest API layer and the Playwright E2E layer can share it.
 */
export function readOutbox(file: string): CapturedMail[] {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CapturedMail);
}

export function outboxIndexIn(file: string): number {
  const all = readOutbox(file);
  return all.length ? all[all.length - 1].i : -1;
}

export async function waitForMailIn(
  file: string,
  to: string,
  opts: { since?: number; match?: RegExp; timeoutMs?: number } = {}
): Promise<CapturedMail> {
  const since = opts.since ?? -1;
  const target = to.toLowerCase();
  const deadline = Date.now() + (opts.timeoutMs ?? 8000);
  while (Date.now() < deadline) {
    const hits = readOutbox(file).filter(
      (m) => m.to.toLowerCase() === target && m.i > since && (!opts.match || opts.match.test(m.text))
    );
    if (hits.length) return hits[hits.length - 1];
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timed out waiting for email to ${to}${opts.match ? ` matching ${opts.match}` : ""}.`);
}

export async function expectNoMailIn(file: string, to: string, since: number, windowMs = 1500): Promise<void> {
  const target = to.toLowerCase();
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const hit = readOutbox(file).find((m) => m.to.toLowerCase() === target && m.i > since);
    if (hit) throw new Error(`Unexpected email to ${to}: ${hit.subject}`);
    await new Promise((r) => setTimeout(r, 150));
  }
}

export function verificationToken(mail: CapturedMail): string {
  return extractToken(mail.text, "verify-email");
}

export function resetToken(mail: CapturedMail): string {
  return extractToken(mail.text, "reset-password");
}

export function emailOtp(mail: CapturedMail): string {
  const m = /sign-in code is:\s*(\d{6})/.exec(mail.text);
  if (!m) throw new Error(`No 6-digit sign-in code found in email:\n${mail.text}`);
  return m[1];
}

function extractToken(text: string, pathHint: string): string {
  const line = text.split("\n").find((l) => l.includes(pathHint)) ?? text;
  const m = /[?&]token=([A-Za-z0-9\-_.%]+)/.exec(line);
  if (!m) throw new Error(`No token found for ${pathHint} in email:\n${text}`);
  return decodeURIComponent(m[1]);
}
