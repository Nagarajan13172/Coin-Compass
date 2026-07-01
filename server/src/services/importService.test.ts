import { describe, it, expect } from "vitest";
import { parseCsv } from "./importService";

describe("importService.parseCsv", () => {
  it("parses a simple comma-separated table", () => {
    const rows = parseCsv("Date,Type,Amount\n2026-01-01,expense,100");
    expect(rows).toEqual([
      ["Date", "Type", "Amount"],
      ["2026-01-01", "expense", "100"],
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const rows = parseCsv('Note,Amount\n"Lunch, with tax",250');
    expect(rows[1]).toEqual(["Lunch, with tax", "250"]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    const rows = parseCsv('Note\n"She said ""hi"""');
    expect(rows[1]).toEqual(['She said "hi"']);
  });

  it("supports newlines embedded in quoted fields", () => {
    const rows = parseCsv('Note,Amount\n"line1\nline2",10');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["line1\nline2", "10"]);
  });

  it("tolerates CRLF line endings and a leading BOM", () => {
    const rows = parseCsv("﻿a,b\r\n1,2\r\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("auto-detects a semicolon delimiter", () => {
    const rows = parseCsv("Date;Type;Amount\n2026-01-01;income;500");
    expect(rows[1]).toEqual(["2026-01-01", "income", "500"]);
  });

  it("drops fully blank lines", () => {
    const rows = parseCsv("a,b\n\n1,2\n\n");
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("flushes a final row without a trailing newline", () => {
    const rows = parseCsv("a,b\n1,2");
    expect(rows[1]).toEqual(["1", "2"]);
  });
});
