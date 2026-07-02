import { inject } from "vitest";
import * as ob from "./outbox";

export type { CapturedMail } from "./mailSink";
export const { verificationToken, resetToken, emailOtp } = ob;

const file = () => inject("outboxFile");

/** Highest mail index captured so far (-1 if none). Snapshot before an action. */
export const outboxIndex = () => ob.outboxIndexIn(file());

/** Wait for the newest email to `to` after index `since` (optionally matching `match`). */
export const waitForMail = (to: string, opts?: { since?: number; match?: RegExp; timeoutMs?: number }) =>
  ob.waitForMailIn(file(), to, opts);

/** Assert NO email to `to` appears after `since` within the window. */
export const expectNoMail = (to: string, since: number, windowMs?: number) =>
  ob.expectNoMailIn(file(), to, since, windowMs);
