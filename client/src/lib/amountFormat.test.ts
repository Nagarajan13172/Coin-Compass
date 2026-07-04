import { describe, it, expect } from "vitest";
import {
  groupIndianDigits,
  sanitizeAmount,
  formatAmountForInput,
  caretAfterSignificant,
  computeAmountEdit,
} from "./amountFormat";

/**
 * Drive the controlled-input transform the way the DOM does: insert each key at
 * the caret, then run it through computeAmountEdit and carry the resulting
 * display + caret into the next keystroke.
 */
function type(keys: string, allowNegative = false, start = { display: "", caret: 0 }) {
  let display = start.display;
  let caret = start.caret;
  let clean = "";
  for (const key of keys) {
    const text = display.slice(0, caret) + key + display.slice(caret);
    const res = computeAmountEdit(text, caret + 1, allowNegative);
    display = res.display;
    caret = res.caret;
    clean = res.clean;
  }
  return { display, caret, clean };
}

describe("groupIndianDigits", () => {
  it("leaves up to three digits ungrouped", () => {
    expect(groupIndianDigits("")).toBe("");
    expect(groupIndianDigits("5")).toBe("5");
    expect(groupIndianDigits("999")).toBe("999");
  });

  it("groups with lakh/crore placement", () => {
    expect(groupIndianDigits("1234")).toBe("1,234");
    expect(groupIndianDigits("12345")).toBe("12,345");
    expect(groupIndianDigits("100000")).toBe("1,00,000");
    expect(groupIndianDigits("1234567")).toBe("12,34,567");
    expect(groupIndianDigits("10000000")).toBe("1,00,00,000");
  });
});

describe("sanitizeAmount", () => {
  it("strips grouping and non-numeric characters", () => {
    expect(sanitizeAmount("1,00,000")).toBe("100000");
    expect(sanitizeAmount("₹ 12,345")).toBe("12345");
    expect(sanitizeAmount("12a3")).toBe("123");
  });

  it("keeps a single decimal point and caps at two decimals", () => {
    expect(sanitizeAmount("1234.5")).toBe("1234.5");
    expect(sanitizeAmount("1234.567")).toBe("1234.56");
    expect(sanitizeAmount("12.3.4")).toBe("12.34");
  });

  it("normalizes leading zeros", () => {
    expect(sanitizeAmount("007")).toBe("7");
    expect(sanitizeAmount("0")).toBe("0");
    expect(sanitizeAmount(".5")).toBe("0.5");
    expect(sanitizeAmount("")).toBe("");
  });

  it("only allows a minus sign when permitted", () => {
    expect(sanitizeAmount("-500")).toBe("500");
    expect(sanitizeAmount("-500", true)).toBe("-500");
  });

  it("preserves a trailing dot while typing", () => {
    expect(sanitizeAmount("1234.")).toBe("1234.");
  });
});

describe("formatAmountForInput", () => {
  it("round-trips canonical values into grouped display", () => {
    expect(formatAmountForInput("")).toBe("");
    expect(formatAmountForInput("80000")).toBe("80,000");
    expect(formatAmountForInput("100000")).toBe("1,00,000");
    expect(formatAmountForInput("1234.5")).toBe("1,234.5");
    expect(formatAmountForInput("0.5")).toBe("0.5");
    expect(formatAmountForInput("1234.")).toBe("1,234.");
    expect(formatAmountForInput("-1500")).toBe("-1,500");
  });
});

describe("computeAmountEdit (typing simulation)", () => {
  it("groups as digits are typed left to right, caret at end", () => {
    const r = type("1234567");
    expect(r.display).toBe("12,34,567");
    expect(r.clean).toBe("1234567");
    expect(r.caret).toBe(r.display.length);
  });

  it("re-groups into lakhs/crores", () => {
    expect(type("100000").display).toBe("1,00,000");
    expect(type("10000000").display).toBe("1,00,00,000");
  });

  it("handles decimals and caps at two places", () => {
    expect(type("1234.5").display).toBe("1,234.5");
    const capped = type("1234.567");
    expect(capped.display).toBe("1,234.56");
    expect(capped.clean).toBe("1234.56");
  });

  it("keeps the caret next to the freshly typed digit on a mid-string insert", () => {
    // type "10,000", then insert "5" right after the leading "1"
    const initial = type("10000"); // display "10,000", caret 6
    const r = type("5", false, { display: initial.display, caret: 1 });
    expect(r.display).toBe("1,50,000");
    expect(r.clean).toBe("150000");
    // caret should sit right after the "5" the user just typed -> "1,5|0,000"
    expect(r.display.slice(0, r.caret)).toBe("1,5");
  });

  it("honors allowNegative", () => {
    expect(type("-500", true).clean).toBe("-500");
    expect(type("-500", true).display).toBe("-500");
    expect(type("-500", false).clean).toBe("500");
  });
});

describe("caretAfterSignificant", () => {
  it("counts digits and the dot, skipping commas", () => {
    // "1,23,456" — after typing the 6th significant digit, caret sits at the end
    expect(caretAfterSignificant("1,23,456", 6)).toBe(8);
    // after 1 significant char, caret is right after "1"
    expect(caretAfterSignificant("1,23,456", 1)).toBe(1);
    // zero significant chars -> start of the field
    expect(caretAfterSignificant("1,23,456", 0)).toBe(0);
  });
});
