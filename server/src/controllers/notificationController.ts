import type { Request, Response } from "express";
import {
  listNotifications,
  markRead,
  markAllRead,
  clearOne,
  clearAll,
} from "../services/notificationService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/** The caller's notifications, newest first, with an unread count. */
export async function list(req: Request, res: Response) {
  res.json(await listNotifications(userId(req)));
}

/** Mark a single notification as read. */
export async function readOne(req: Request, res: Response) {
  const ok = await markRead(userId(req), req.params.id);
  if (!ok) throw new HttpError(404, "Notification not found");
  res.json({ ok: true });
}

/** Mark all of the caller's notifications as read. */
export async function readAll(req: Request, res: Response) {
  const updated = await markAllRead(userId(req));
  res.json({ updated });
}

/** Delete a single notification. */
export async function removeOne(req: Request, res: Response) {
  const ok = await clearOne(userId(req), req.params.id);
  if (!ok) throw new HttpError(404, "Notification not found");
  res.json({ ok: true });
}

/** Delete all of the caller's notifications. */
export async function removeAll(req: Request, res: Response) {
  const deleted = await clearAll(userId(req));
  res.json({ deleted });
}
