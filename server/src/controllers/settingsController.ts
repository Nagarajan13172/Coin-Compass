import type { Request, Response } from "express";
import { createHash } from "node:crypto";
import { getSettings } from "../models/Settings";
import { settingsUpdateSchema } from "../validators/schemas";
import { HttpError } from "../middleware/errorHandler";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

export async function getSettingsHandler(_req: Request, res: Response) {
  const settings = await getSettings();
  const obj = settings.toObject();
  // never leak the hash to the client
  delete (obj as Record<string, unknown>).pinHash;
  res.json(obj);
}

export async function updateSettingsHandler(req: Request, res: Response) {
  const data = settingsUpdateSchema.parse(req.body);
  const settings = await getSettings();
  Object.assign(settings, data);
  await settings.save();
  const obj = settings.toObject();
  delete (obj as Record<string, unknown>).pinHash;
  res.json(obj);
}

export async function setPin(req: Request, res: Response) {
  const pin = String(req.body?.pin ?? "");
  if (!/^\d{4,8}$/.test(pin)) throw new HttpError(400, "PIN must be 4-8 digits");
  const settings = await getSettings();
  settings.pinHash = hashPin(pin);
  settings.pinEnabled = true;
  await settings.save();
  res.json({ ok: true, pinEnabled: true });
}

export async function disablePin(_req: Request, res: Response) {
  const settings = await getSettings();
  settings.pinHash = null;
  settings.pinEnabled = false;
  await settings.save();
  res.json({ ok: true, pinEnabled: false });
}

export async function verifyPin(req: Request, res: Response) {
  const pin = String(req.body?.pin ?? "");
  const settings = await getSettings();
  if (!settings.pinEnabled || !settings.pinHash) {
    return res.json({ ok: true });
  }
  res.json({ ok: settings.pinHash === hashPin(pin) });
}
