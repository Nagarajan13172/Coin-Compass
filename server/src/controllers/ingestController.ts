import type { Request, Response } from "express";
import { getSettings } from "../models/Settings";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";
import { generateIngestToken, hashIngestToken } from "../middleware/ingestAuth";
import { ingestSchema, ingestCommitSchema } from "../validators/schemas";
import {
  ingestPayment,
  listPending,
  listRecentCommitted,
  commitPending,
  dismissPending,
} from "../services/ingestService";

/**
 * The webhook a phone forwarder (MacroDroid/Tasker) hits when a payment
 * notification arrives. Authenticated by the ingest token (requireIngestToken has
 * already set req.userId). Always returns 200 with the outcome so the forwarder
 * doesn't retry-storm on a "duplicate"/"ignored" that is a normal result.
 */
export async function ingestWebhook(req: Request, res: Response) {
  const data = ingestSchema.parse(req.body);
  const result = await ingestPayment(userId(req), {
    text: data.text,
    title: data.title,
    source: data.source,
    postedAt: data.postedAt,
  });
  res.json({
    ok: true,
    status: result.status,
    transactionId: result.transactionId ?? null,
    id: result.id ?? null,
  });
}

/** Review inbox: pending captures (+ count) and a few recent auto-committed ones. */
export async function listInbox(req: Request, res: Response) {
  const uid = userId(req);
  const [{ items, count }, recent] = await Promise.all([listPending(uid), listRecentCommitted(uid)]);
  res.json({ pending: items, count, recent });
}

/** Confirm a pending capture (with optional edits) → creates the transaction. */
export async function commitInbox(req: Request, res: Response) {
  const edits = ingestCommitSchema.parse(req.body);
  const txn = await commitPending(userId(req), req.params.id, edits);
  if (!txn) throw new HttpError(404, "Pending capture not found");
  res.status(201).json(txn);
}

/** Dismiss a pending capture without creating a transaction. */
export async function dismissInbox(req: Request, res: Response) {
  const ok = await dismissPending(userId(req), req.params.id);
  if (!ok) throw new HttpError(404, "Pending capture not found");
  res.json({ ok: true });
}

/**
 * Generate (or rotate) the ingest token and turn auto-capture on. The raw token is
 * returned ONCE here; only its hash is stored. Also seeds a default UPI account so
 * captures have somewhere to land.
 */
export async function regenerateToken(req: Request, res: Response) {
  const uid = userId(req);
  const settings = await getSettings(uid);
  const token = generateIngestToken();
  settings.ingestTokenHash = hashIngestToken(token);
  settings.ingestTokenHint = token.slice(-4);
  settings.ingestEnabled = true;
  await settings.save();
  res.json({ ok: true, token, hint: settings.ingestTokenHint, enabled: true });
}

/** Turn auto-capture off and revoke the token (the webhook stops accepting it). */
export async function disableToken(req: Request, res: Response) {
  const settings = await getSettings(userId(req));
  settings.ingestEnabled = false;
  settings.ingestTokenHash = null;
  settings.ingestTokenHint = null;
  await settings.save();
  res.json({ ok: true, enabled: false });
}
