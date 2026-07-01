import type { Request, Response } from "express";
import { getSettings } from "../models/Settings";
import { importTransactionsCsv, importTransactionsXlsx } from "../services/importService";
import { HttpError } from "../middleware/errorHandler";

/** .xlsx (and .docx/.zip) files start with the ZIP local-file signature "PK\x03\x04". */
function isXlsx(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Import transactions from a raw CSV or .xlsx body (sent as the request body bytes). */
export async function importFile(req: Request, res: Response) {
  const buf: Buffer = Buffer.isBuffer(req.body)
    ? req.body
    : typeof req.body === "string"
      ? Buffer.from(req.body, "utf8")
      : Buffer.alloc(0);
  if (buf.length === 0) throw new HttpError(400, "No file content provided");

  const settings = await getSettings();
  const currency = settings.baseCurrency ?? "INR";

  const result = isXlsx(buf)
    ? await importTransactionsXlsx(buf, currency)
    : await importTransactionsCsv(buf.toString("utf8"), currency);

  res.json(result);
}
