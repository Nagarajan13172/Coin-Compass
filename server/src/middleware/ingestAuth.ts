import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import { Settings } from "../models/Settings";
import { HttpError } from "./errorHandler";

/** SHA-256 of an ingest token — only the hash is ever stored (like the PIN). */
export function hashIngestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a fresh, URL-safe ingest token. Shown to the user once; we keep the hash. */
export function generateIngestToken(): string {
  return `ing_${randomBytes(24).toString("base64url")}`;
}

/**
 * Authenticate the ingest webhook by a per-user token (MacroDroid can't hold a
 * session cookie). Accepts the token in the `X-Ingest-Token` header or the body's
 * `token` field, hashes it, and resolves the owning user — setting req.userId so
 * downstream code is identical to a normal authenticated request. 401 otherwise.
 */
export async function requireIngestToken(req: Request, _res: Response, next: NextFunction) {
  const raw = String(req.header("x-ingest-token") || (req.body && req.body.token) || "").trim();
  if (!raw) throw new HttpError(401, "Missing ingest token");
  const settings = await Settings.findOne({
    ingestTokenHash: hashIngestToken(raw),
    ingestEnabled: true,
  })
    .select("user")
    .lean();
  if (!settings) throw new HttpError(401, "Invalid ingest token");
  req.userId = String(settings.user);
  next();
}
