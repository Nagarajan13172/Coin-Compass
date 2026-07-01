import { Transaction } from "../models/Transaction";

function escapeCsv(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a CSV string of a user's transactions in a date range. */
export async function exportTransactionsCsv(userId: string, start: Date, end: Date): Promise<string> {
  const txns = await Transaction.find({ user: userId, date: { $gte: start, $lt: end } })
    .sort({ date: -1 })
    .populate("account", "name")
    .populate("toAccount", "name")
    .populate("category", "name")
    .lean();

  const header = [
    "Date",
    "Type",
    "Amount",
    "Currency",
    "Account",
    "To Account",
    "Category",
    "Payee",
    "Note",
    "Tags",
  ];

  const rows = txns.map((t) => {
    const account = t.account as unknown as { name?: string } | null;
    const toAccount = t.toAccount as unknown as { name?: string } | null;
    const category = t.category as unknown as { name?: string } | null;
    return [
      new Date(t.date).toISOString().slice(0, 10),
      t.type,
      t.amount,
      t.currency,
      account?.name ?? "",
      toAccount?.name ?? "",
      category?.name ?? "",
      t.payee ?? "",
      t.note ?? "",
      (t.tags ?? []).join(" "),
    ].map(escapeCsv).join(",");
  });

  return [header.join(","), ...rows].join("\n");
}
