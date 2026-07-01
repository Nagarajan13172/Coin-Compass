import type { Request, Response } from "express";
import { Loan } from "../models/Loan";
import { loanSchema, loanUpdateSchema } from "../validators/schemas";
import { userId } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export async function listLoans(req: Request, res: Response) {
  const uid = userId(req);
  const loans = await Loan.find({ user: uid }).sort({ status: 1, outstanding: -1 }).lean();
  res.json(loans);
}

export async function createLoan(req: Request, res: Response) {
  const uid = userId(req);
  const data = loanSchema.parse(req.body);
  const loan = await Loan.create({ ...data, user: uid });
  res.status(201).json(loan.toObject());
}

export async function updateLoan(req: Request, res: Response) {
  const uid = userId(req);
  const data = loanUpdateSchema.parse(req.body);
  const loan = await Loan.findOneAndUpdate({ _id: req.params.id, user: uid }, data, { new: true });
  if (!loan) throw new HttpError(404, "Loan not found");
  res.json(loan.toObject());
}

export async function deleteLoan(req: Request, res: Response) {
  const uid = userId(req);
  const loan = await Loan.findOneAndDelete({ _id: req.params.id, user: uid });
  if (!loan) throw new HttpError(404, "Loan not found");
  res.json({ ok: true });
}
