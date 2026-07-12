import type { Request, Response } from "express";
import { Template } from "../models/Template";
import { templateSchema, templateUpdateSchema } from "../validators/schemas";
import { ensureDefaultTemplatesSeeded } from "../services/templateService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

const POPULATE = [
  { path: "category", select: "name color icon type" },
  { path: "account", select: "name color icon currency" },
] as const;

export async function listTemplates(req: Request, res: Response) {
  const uid = userId(req);
  // Pre-existing users (created before quick-add shipped) get the default chips
  // here on first fetch — so no manual backfill is needed in production.
  await ensureDefaultTemplatesSeeded(uid);
  const templates = await Template.find({ user: uid })
    .sort({ order: 1, createdAt: 1 })
    .populate(POPULATE as never)
    .lean();
  res.json(templates);
}

export async function createTemplate(req: Request, res: Response) {
  const uid = userId(req);
  const data = templateSchema.parse(req.body);
  const template = await Template.create({ ...data, user: uid });
  const populated = await template.populate(POPULATE as never);
  res.status(201).json(populated.toObject());
}

export async function updateTemplate(req: Request, res: Response) {
  const uid = userId(req);
  const data = templateUpdateSchema.parse(req.body);
  const template = await Template.findOneAndUpdate({ _id: req.params.id, user: uid }, data, { new: true }).populate(
    POPULATE as never
  );
  if (!template) throw new HttpError(404, "Template not found");
  res.json(template.toObject());
}

export async function deleteTemplate(req: Request, res: Response) {
  const uid = userId(req);
  const template = await Template.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!template) throw new HttpError(404, "Template not found");
  res.json({ ok: true });
}
