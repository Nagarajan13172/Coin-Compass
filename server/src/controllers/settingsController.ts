import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { getSettings, type SettingsDoc } from "../models/Settings";
import { settingsUpdateSchema } from "../validators/schemas";
import { hashPassword } from "../auth/password";
import { setSessionCookie } from "../auth/cookie";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

/** Strip secret hashes and surface a boolean `wealthLockEnabled` flag instead. */
function publicSettings(settings: SettingsDoc & { toObject: () => Record<string, unknown> }) {
  const obj = settings.toObject();
  const wealthLockEnabled = Boolean(obj.wealthPasscodeHash);
  delete obj.pinHash;
  delete obj.wealthPasscodeHash;
  // Never leak the ingest token hash; the boolean + last-4 hint are enough for the UI.
  delete obj.ingestTokenHash;
  return { ...obj, wealthLockEnabled };
}

export async function getSettingsHandler(req: Request, res: Response) {
  const settings = await getSettings(userId(req));
  res.json(publicSettings(settings as never));
}

export async function updateSettingsHandler(req: Request, res: Response) {
  const data = settingsUpdateSchema.parse(req.body);
  const settings = await getSettings(userId(req));
  Object.assign(settings, data);
  await settings.save();
  res.json(publicSettings(settings as never));
}

/** Turn on / change the wealth lock. Allowed the first time (no lock yet) or while
 *  superadmin — the route is guarded by requireWealthAccess. */
export async function setWealthPasscode(req: Request, res: Response) {
  const passcode = String(req.body?.passcode ?? "");
  if (passcode.length < 4 || passcode.length > 32)
    throw new HttpError(400, "Passcode must be 4-32 characters");
  const settings = await getSettings(userId(req));
  settings.wealthPasscodeHash = await hashPassword(passcode);
  await settings.save();
  // Turning the lock on (or changing the passcode) must NOT demote the person
  // doing it — they keep full access this session; only future logins start in
  // the everyday view. So re-issue the cookie in superadmin mode.
  setSessionCookie(res, userId(req), "superadmin");
  res.json({ ok: true, wealthLockEnabled: true });
}

/** Turn off the wealth lock (route guarded by requireWealthAccess → superadmin only). */
export async function disableWealthPasscode(req: Request, res: Response) {
  const settings = await getSettings(userId(req));
  settings.wealthPasscodeHash = null;
  await settings.save();
  res.json({ ok: true, wealthLockEnabled: false });
}

export async function setPin(req: Request, res: Response) {
  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, "PIN must be 4-8 digits");
  const settings = await getSettings(userId(req));
  settings.pinHash = hashPin(pin);
  settings.pinEnabled = true;
  await settings.save();
  res.json({ ok: true, pinEnabled: true });
}

export async function disablePin(req: Request, res: Response) {
  const settings = await getSettings(userId(req));
  settings.pinHash = null;
  settings.pinEnabled = false;
  await settings.save();
  res.json({ ok: true, pinEnabled: false });
}

export async function verifyPin(req: Request, res: Response) {
  const pin = String(req.body?.pin ?? "");
  const settings = await getSettings(userId(req));
  if (!settings.pinEnabled || !settings.pinHash) {
    return res.json({ ok: true });
  }
  res.json({ ok: settings.pinHash === hashPin(pin) });
}
