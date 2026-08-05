import type { Request, Response } from "express";
import {
  personSchema,
  personUpdateSchema,
  personMergeSchema,
  personGroupSchema,
  personGroupUpdateSchema,
} from "../validators/schemas";
import {
  listPeople,
  createPerson,
  updatePerson,
  deletePerson,
  mergePeople,
  listGroups,
  createGroup,
  updateGroup,
  deleteGroup,
} from "../services/personService";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function listPeopleHandler(req: Request, res: Response) {
  res.json(await listPeople(userId(req)));
}

export async function createPersonHandler(req: Request, res: Response) {
  const data = personSchema.parse(req.body);
  res.status(201).json(await createPerson(userId(req), data));
}

export async function updatePersonHandler(req: Request, res: Response) {
  const data = personUpdateSchema.parse(req.body);
  const person = await updatePerson(userId(req), req.params.id, data);
  if (!person) throw new HttpError(404, "Person not found");
  res.json(person);
}

export async function deletePersonHandler(req: Request, res: Response) {
  // `?force=true` is the second step of the shared type-to-confirm delete flow:
  // the first attempt 409s while the person still has entries (see personService).
  const force = req.query.force === "true";
  const ok = await deletePerson(userId(req), req.params.id, force);
  if (!ok) throw new HttpError(404, "Person not found");
  res.json({ ok: true });
}

export async function mergePersonHandler(req: Request, res: Response) {
  const { into } = personMergeSchema.parse(req.body);
  res.json(await mergePeople(userId(req), req.params.id, into));
}

// ─────────────────────────── groups ───────────────────────────

export async function listGroupsHandler(req: Request, res: Response) {
  res.json(await listGroups(userId(req)));
}

export async function createGroupHandler(req: Request, res: Response) {
  const data = personGroupSchema.parse(req.body);
  res.status(201).json(await createGroup(userId(req), data));
}

export async function updateGroupHandler(req: Request, res: Response) {
  const data = personGroupUpdateSchema.parse(req.body);
  const group = await updateGroup(userId(req), req.params.id, data);
  if (!group) throw new HttpError(404, "Group not found");
  res.json(group);
}

export async function deleteGroupHandler(req: Request, res: Response) {
  const ok = await deleteGroup(userId(req), req.params.id);
  if (!ok) throw new HttpError(404, "Group not found");
  res.json({ ok: true });
}
