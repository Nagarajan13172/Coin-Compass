import type { Request, Response } from "express";
import { Holding } from "../models/Holding";
import { Transaction } from "../models/Transaction";
import {
  holdingSchema,
  holdingUpdateSchema,
  holdingDepositSchema,
  holdingWithdrawSchema,
  holdingAdoptSchema,
  holdingLinkRuleSchema,
  instalmentSchema,
} from "../validators/schemas";
import {
  adoptTransactions,
  depositCandidates,
  depositToHolding,
  withdrawFromHolding,
} from "../services/depositService";
import {
  instalmentsFor,
  linkRuleToHolding,
  progressFor,
  syncInstalment,
  unlinkedRules,
} from "../services/depositScheduleService";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

/**
 * `instalment` is the standing order feeding the holding, inlined so the card and
 * the edit form can show the schedule without a second round trip — and so the
 * deposit reads as one thing rather than a value here and a rule somewhere else.
 */
export async function listHoldings(req: Request, res: Response) {
  const uid = userId(req);
  const holdings = await Holding.find({ user: uid }).sort({ value: -1 }).lean();
  const ids = holdings.map((h) => h._id);
  const [schedules, paid] = await Promise.all([instalmentsFor(uid, ids), progressFor(uid, ids)]);
  res.json(
    holdings.map((h) => ({
      ...h,
      instalment: schedules.get(String(h._id)) ?? null,
      paid: paid.get(String(h._id)) ?? { count: 0, total: 0 },
    }))
  );
}

/**
 * A recurring deposit runs for an agreed number of payments. Without the term
 * there is no progress to show and no maturity to reach — it would just be a
 * standing order that runs for ever, which is not what an RD is.
 */
function assertTermForRD(subtype: unknown, termCount: unknown, instalment: unknown) {
  const scheduled = instalment !== undefined && instalment !== null;
  if (subtype === "recurring_deposit" && scheduled && !termCount) {
    throw new HttpError(400, "Set how many instalments this deposit runs for", "DEPOSIT_TERM_REQUIRED");
  }
}

/**
 * Apply the `instalment` block a holding request may carry: an object sets or
 * replaces the schedule, `null` stops it, and leaving it out changes nothing —
 * so a plain rename can never silently cancel someone's RD.
 */
async function applyInstalment(uid: string, holdingId: unknown, raw: unknown, termCount?: number | null) {
  if (raw === undefined) return undefined;
  if (raw === null) return syncInstalment(uid, holdingId, null);
  return syncInstalment(uid, holdingId, { ...instalmentSchema.parse(raw), termCount });
}

export async function createHolding(req: Request, res: Response) {
  const uid = userId(req);
  const { instalment, ...body } = (req.body ?? {}) as Record<string, unknown>;
  const data = holdingSchema.parse(body);
  assertTermForRD(data.subtype, data.termCount, instalment);
  const holding = await Holding.create({ ...data, user: uid });
  const schedule = await applyInstalment(uid, holding._id, instalment, data.termCount);
  res.status(201).json({ ...holding.toObject(), instalment: schedule ?? null });
}

export async function updateHolding(req: Request, res: Response) {
  const uid = userId(req);
  const { instalment, ...body } = (req.body ?? {}) as Record<string, unknown>;
  const data = holdingUpdateSchema.parse(body);
  const current = await Holding.findOne({ _id: req.params.id, user: uid });
  if (!current) throw new HttpError(404, "Holding not found");
  // Checked against what the request would leave behind, and checked BEFORE the
  // write: a rejected save should change nothing, not keep the edits and drop
  // the schedule on the floor.
  assertTermForRD(
    data.subtype ?? current.subtype,
    data.termCount !== undefined ? data.termCount : current.termCount,
    instalment
  );

  const holding = await Holding.findOneAndUpdate({ _id: req.params.id, user: uid }, data, { new: true });
  if (!holding) throw new HttpError(404, "Holding not found");
  const schedule = await applyInstalment(uid, holding._id, instalment, holding.termCount);
  res.json({
    ...holding.toObject(),
    instalment:
      schedule !== undefined ? schedule : ((await instalmentsFor(uid, [holding._id])).get(String(holding._id)) ?? null),
  });
}

export async function deleteHolding(req: Request, res: Response) {
  const uid = userId(req);
  const holding = await Holding.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!holding) throw new HttpError(404, "Holding not found");
  // The ledger legs that fed it stay: the money really did move out of the bank
  // on those days, and rewriting history to hide that would be a lie. They simply
  // stop naming a holding, so an edit or delete no longer tries to reverse onto
  // a document that is gone.
  await Transaction.updateMany({ user: uid, holding: holding._id }, { $set: { holding: null, holdingContribution: 0 } });
  // The standing order goes with it. A rule pointing at a deleted holding would
  // fail on every run and stall — depositToHolding throws, and the scheduler
  // stops without advancing rather than skipping the instalment silently.
  await RecurringTransaction.deleteMany({ user: uid, holding: holding._id });
  res.json({ ok: true });
}

/** Pay into a deposit — the RD instalment. A transfer, never a spend. */
export async function depositHolding(req: Request, res: Response) {
  const uid = userId(req);
  const data = holdingDepositSchema.parse(req.body);
  const result = await depositToHolding(uid, { ...data, holding: req.params.id });
  res.status(201).json(result);
}

/** Take money out — a maturity payout or a partial withdrawal. */
export async function withdrawHolding(req: Request, res: Response) {
  const uid = userId(req);
  const data = holdingWithdrawSchema.parse(req.body);
  res.json(await withdrawFromHolding(uid, { ...data, holding: req.params.id }));
}

/** Past expenses that look like payments into this deposit. */
export async function holdingCandidates(req: Request, res: Response) {
  res.json(await depositCandidates(userId(req), req.params.id));
}

/** Rewrite those past expenses as payments into this deposit. */
export async function adoptHoldingTransactions(req: Request, res: Response) {
  const uid = userId(req);
  const { transactions } = holdingAdoptSchema.parse(req.body);
  res.json(await adoptTransactions(uid, req.params.id, transactions));
}

/** Recurring rules that could be adopted as a deposit's schedule. */
export async function linkableRules(req: Request, res: Response) {
  res.json(await unlinkedRules(userId(req)));
}

/**
 * Claim an existing recurring rule as this deposit's schedule.
 *
 * For anyone who was already running an RD before deposits existed: the rule
 * keeps its id, its schedule position and its history, so nothing is duplicated
 * and nothing has to be set up twice.
 */
export async function linkHoldingRule(req: Request, res: Response) {
  const uid = userId(req);
  const { recurring } = holdingLinkRuleSchema.parse(req.body);
  res.json(await linkRuleToHolding(uid, req.params.id, recurring));
}
