import { Types } from "mongoose";
import ExcelJS from "exceljs";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { Transaction } from "../models/Transaction";
import { HttpError } from "../middleware/errorHandler";

export interface ImportResult {
  total: number;
  imported: number;
  failed: { row: number; error: string }[];
  createdCategories: string[];
  createdAccounts: string[];
}

/**
 * Parse CSV text into a matrix of string cells. Handles quoted fields, escaped
 * quotes (""), embedded commas/newlines, CRLF line endings, a leading BOM, and
 * auto-detects a ';' delimiter (common in Excel exports from some locales).
 */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, ""); // strip UTF-8 BOM
  const nl = text.indexOf("\n");
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  // flush trailing field/row (files may not end in a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // drop blank lines
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// Header labels (lowercased) -> canonical field. Matches the export columns plus common aliases.
const HEADER_ALIASES: Record<string, string> = {
  date: "date",
  type: "type",
  amount: "amount",
  currency: "currency",
  account: "account",
  "account from": "account",
  "from account": "account",
  "to account": "toAccount",
  "toaccount": "toAccount",
  "to_account": "toAccount",
  category: "category",
  payee: "payee",
  note: "note",
  notes: "note",
  description: "note",
  tags: "tags",
};

const REQUIRED = ["date", "type", "amount", "account"] as const;

// Palette for auto-created categories so they're visually distinct.
const CATEGORY_COLORS = [
  "#2563EB", "#16A34A", "#DC2626", "#D97706", "#7C3AED",
  "#0891B2", "#DB2777", "#65A30D", "#EA580C", "#4F46E5",
];

function parseAmount(raw: string): number {
  // strip currency symbols, spaces and thousands separators; keep digits, dot, minus
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}

function parseDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Stringify an ExcelJS cell value into the plain text our row mapper expects. */
function cellToString(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? "").join("");
    }
    if ("result" in o) return cellToString(o.result); // formula → its computed value
    if ("text" in o) return cellToString(o.text); // hyperlink
    if ("error" in o) return "";
    return "";
  }
  return String(v);
}

/** Read the first worksheet of an .xlsx workbook into a matrix of string cells. */
export async function xlsxToRows(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  // Cast sidesteps @types/node's generic Buffer vs exceljs's Buffer typing; exceljs
  // accepts a Node Buffer at runtime.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const colCount = ws.columnCount;
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let c = 1; c <= colCount; c += 1) cells.push(cellToString(row.getCell(c).value).trim());
    rows.push(cells);
  });
  return rows.filter((r) => r.some((cell) => cell !== ""));
}

/**
 * Import transactions from CSV text. Resolves accounts and categories by name,
 * creating any that don't exist (categories keyed by name + type). Invalid rows
 * are collected in `failed` and skipped; valid rows are inserted.
 */
export async function importTransactionsCsv(
  text: string,
  userId: string,
  defaultCurrency = "INR"
): Promise<ImportResult> {
  return importRows(parseCsv(text), userId, defaultCurrency);
}

/** Import transactions from a raw .xlsx workbook buffer. */
export async function importTransactionsXlsx(
  buffer: Buffer,
  userId: string,
  defaultCurrency = "INR"
): Promise<ImportResult> {
  return importRows(await xlsxToRows(buffer), userId, defaultCurrency);
}

/** Shared core: map a header + data-row matrix into a user's transactions. */
async function importRows(rows: string[][], userId: string, defaultCurrency = "INR"): Promise<ImportResult> {
  const user = new Types.ObjectId(userId);
  if (rows.length < 2) {
    throw new HttpError(400, "The file has a header row but no data rows");
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col: Record<string, number> = {};
  header.forEach((h, i) => {
    const key = HEADER_ALIASES[h];
    if (key && !(key in col)) col[key] = i;
  });

  const missing = REQUIRED.filter((r) => !(r in col));
  if (missing.length) {
    throw new HttpError(
      400,
      `Missing required column(s): ${missing.join(", ")}. Expected headers like: Date, Type, Amount, Account, Category.`
    );
  }

  const [accounts, categories] = await Promise.all([
    Account.find({ user }).select("name").lean(),
    Category.find({ user }).select("name type").lean(),
  ]);
  const accountByName = new Map<string, Types.ObjectId>(
    accounts.map((a) => [a.name.trim().toLowerCase(), a._id as Types.ObjectId])
  );
  const categoryByKey = new Map<string, Types.ObjectId>(
    categories.map((c) => [`${c.type}:${c.name.trim().toLowerCase()}`, c._id as Types.ObjectId])
  );

  const createdAccounts: string[] = [];
  const createdCategories: string[] = [];

  async function resolveAccount(name: string): Promise<Types.ObjectId> {
    const key = name.trim().toLowerCase();
    const existing = accountByName.get(key);
    if (existing) return existing;
    const acc = await Account.create({ user, name: name.trim(), type: "cash" });
    accountByName.set(key, acc._id as Types.ObjectId);
    createdAccounts.push(name.trim());
    return acc._id as Types.ObjectId;
  }

  async function resolveCategory(name: string, type: string): Promise<Types.ObjectId> {
    const key = `${type}:${name.trim().toLowerCase()}`;
    const existing = categoryByKey.get(key);
    if (existing) return existing;
    const color = CATEGORY_COLORS[createdCategories.length % CATEGORY_COLORS.length];
    const cat = await Category.create({ user, name: name.trim(), type, color });
    categoryByKey.set(key, cat._id as Types.ObjectId);
    createdCategories.push(name.trim());
    return cat._id as Types.ObjectId;
  }

  const failed: { row: number; error: string }[] = [];
  const docs: Record<string, unknown>[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const row = rows[r];
    const cell = (k: string) => (k in col ? (row[col[k]] ?? "").trim() : "");
    const lineNo = r + 1; // 1-based, accounting for the header row
    try {
      const type = cell("type").toLowerCase();
      if (!["income", "expense", "transfer"].includes(type)) {
        throw new Error(`Invalid type "${cell("type")}" (expected income, expense or transfer)`);
      }
      const amount = parseAmount(cell("amount"));
      if (!(amount > 0)) throw new Error(`Invalid amount "${cell("amount")}"`);

      const date = parseDate(cell("date"));
      if (!date) throw new Error(`Invalid date "${cell("date")}"`);

      const accountName = cell("account");
      if (!accountName) throw new Error("Missing account");
      const account = await resolveAccount(accountName);

      let toAccount: Types.ObjectId | null = null;
      let category: Types.ObjectId | null = null;

      if (type === "transfer") {
        const toName = cell("toAccount");
        if (!toName) throw new Error("Transfer is missing a To Account");
        toAccount = await resolveAccount(toName);
        if (String(toAccount) === String(account)) {
          throw new Error("Transfer source and destination accounts must differ");
        }
      } else {
        const catName = cell("category");
        if (catName) category = await resolveCategory(catName, type);
      }

      const tagsRaw = cell("tags");
      const tags = tagsRaw ? tagsRaw.split(/[\s,]+/).filter(Boolean) : [];

      docs.push({
        user,
        type,
        amount,
        account,
        toAccount,
        category,
        date,
        currency: cell("currency") || defaultCurrency,
        payee: cell("payee"),
        note: cell("note"),
        tags,
      });
    } catch (e) {
      failed.push({ row: lineNo, error: e instanceof Error ? e.message : "Invalid row" });
    }
  }

  if (docs.length) await Transaction.insertMany(docs);

  return {
    total: rows.length - 1,
    imported: docs.length,
    failed,
    createdCategories: [...new Set(createdCategories)],
    createdAccounts: [...new Set(createdAccounts)],
  };
}
