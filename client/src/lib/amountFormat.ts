/**
 * Helpers for the Indian-grouped money input (AmountInput).
 *
 * The Indian numbering system groups the last three integer digits together,
 * then every two digits after that: 1234567 -> "12,34,567" (12 lakh 34 thousand).
 * These are kept pure (no React) so they can be unit-tested and reused.
 */

/** Group a run of integer digits with Indian (lakh/crore) comma placement. */
export function groupIndianDigits(digits: string): string {
  if (digits.length <= 3) return digits;
  const last3 = digits.slice(-3);
  const head = digits.slice(0, -3);
  return head.replace(/\B(?=(\d\d)+(?!\d))/g, ",") + "," + last3;
}

/**
 * Reduce raw field text to a canonical numeric string: digits, at most one dot,
 * at most two decimals, no grouping, no leading zeros (except a single "0" for
 * values below one). This is what we store in form state and hand to `Number()`.
 */
export function sanitizeAmount(input: string, allowNegative = false): string {
  const negative = allowNegative && /^\s*-/.test(input);
  const cleaned = input.replace(/[^\d.]/g, "");
  const dotIdx = cleaned.indexOf(".");

  let intPart: string;
  let frac: string | null;
  if (dotIdx === -1) {
    intPart = cleaned;
    frac = null;
  } else {
    intPart = cleaned.slice(0, dotIdx);
    // drop any further dots, keep at most two decimal places (paise)
    frac = cleaned.slice(dotIdx + 1).replace(/\./g, "").slice(0, 2);
  }

  intPart = intPart.replace(/^0+(?=\d)/, "");
  if (intPart === "" && frac !== null) intPart = "0"; // ".5" -> "0.5"

  let body = intPart;
  if (frac !== null) body += "." + frac;
  // Keep a lone leading "-" so a negative can be typed before any digits.
  if (body === "") return negative ? "-" : "";
  return (negative ? "-" : "") + body;
}

/** Expand a canonical numeric string into its Indian-grouped display form. */
export function formatAmountForInput(clean: string): string {
  if (!clean) return "";
  const negative = clean.startsWith("-");
  const body = negative ? clean.slice(1) : clean;
  const dotIdx = body.indexOf(".");
  const intPart = dotIdx === -1 ? body : body.slice(0, dotIdx);
  const tail = dotIdx === -1 ? "" : body.slice(dotIdx);
  return (negative ? "-" : "") + groupIndianDigits(intPart) + tail;
}

/**
 * Caret position (offset into `display`) that sits just after `n` significant
 * characters (digits or the decimal point). Commas and the sign are skipped,
 * so the caret tracks the user's intent across re-grouping.
 */
export function caretAfterSignificant(display: string, n: number): number {
  if (n <= 0) return display.startsWith("-") ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < display.length; i++) {
    const ch = display[i];
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      seen++;
      if (seen === n) return i + 1;
    }
  }
  return display.length;
}

/**
 * Given the raw field text and current caret offset after an edit, compute the
 * canonical value to report upstream, the re-grouped text to show, and where to
 * put the caret. This is the whole controlled-input transform in one pure step
 * (see AmountInput), so it can be unit-tested without a DOM.
 */
export function computeAmountEdit(
  text: string,
  caret: number,
  allowNegative = false
): { clean: string; display: string; caret: number } {
  const sigBefore = (text.slice(0, caret).match(/[\d.]/g) || []).length;
  const clean = sanitizeAmount(text, allowNegative);
  const display = formatAmountForInput(clean);
  return { clean, display, caret: caretAfterSignificant(display, sigBefore) };
}
