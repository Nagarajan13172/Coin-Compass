import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  status: number;
  /** Stable, language-agnostic error code the client can translate. Optional — when
   *  omitted, the handler derives one from the message via MESSAGE_CODES below. */
  code?: string;
  /** Interpolation values for the client's translated message, if any. */
  params?: Record<string, string | number>;
  constructor(status: number, message: string, code?: string, params?: Record<string, string | number>) {
    super(message);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

/**
 * Maps the fixed English error messages thrown across the app to stable codes, so
 * the client can render a translated message without every `throw` site needing to
 * pass a code. Messages built with interpolation aren't listed here and simply fall
 * back to their English text on the client. Keep keys byte-identical to the throws.
 */
const MESSAGE_CODES: Record<string, string> = {
  "Not authenticated": "NOT_AUTHENTICATED",
  "The Net Worth section is locked": "NET_WORTH_LOCKED",
  "Please verify your email to continue": "EMAIL_NOT_VERIFIED",
  "Budget not found": "BUDGET_NOT_FOUND",
  "An account with this email already exists": "EMAIL_TAKEN",
  "Invalid email or password": "INVALID_CREDENTIALS",
  "Current password is required": "CURRENT_PASSWORD_REQUIRED",
  "Current password is incorrect": "CURRENT_PASSWORD_INCORRECT",
  "This provider did not return an email address": "OAUTH_NO_EMAIL",
  "Account not found": "ACCOUNT_NOT_FOUND",
  "Credit entry not found": "CREDIT_NOT_FOUND",
  "Pick an account to reflect this in your balances": "CREDIT_ACCOUNT_REQUIRED",
  "Goal not found": "GOAL_NOT_FOUND",
  "Holding not found": "HOLDING_NOT_FOUND",
  "Your sign-in session expired. Please sign in again.": "SIGNIN_SESSION_EXPIRED",
  "That code is incorrect or expired": "CODE_INCORRECT",
  "That code is incorrect or expired. Try again.": "CODE_INCORRECT_RETRY",
  "Incorrect passcode": "PASSCODE_INCORRECT",
  "Missing verification token": "MISSING_VERIFICATION_TOKEN",
  "This verification link is invalid or has expired": "VERIFICATION_LINK_INVALID",
  "User not found": "USER_NOT_FOUND",
  "Loan not found": "LOAN_NOT_FOUND",
  "Recurring transaction not found": "RECURRING_NOT_FOUND",
  "Unknown auth provider": "UNKNOWN_AUTH_PROVIDER",
  "Invalid OAuth state": "INVALID_OAUTH_STATE",
  "Missing PKCE verifier": "MISSING_PKCE_VERIFIER",
  "No file content provided": "NO_FILE_CONTENT",
  "Category not found": "CATEGORY_NOT_FOUND",
  "Transaction not found": "TRANSACTION_NOT_FOUND",
  "Transfers require a destination account": "TRANSFER_DESTINATION_REQUIRED",
  "Source and destination accounts must differ": "TRANSFER_SAME_ACCOUNT",
  "Passcode must be 4-32 characters": "PASSCODE_LENGTH",
  "PIN must be 4-8 digits": "PIN_FORMAT",
  "The file has a header row but no data rows": "IMPORT_NO_DATA_ROWS",
  "Two-factor authentication is already enabled": "TWO_FA_ALREADY_ENABLED",
  "Start setup before enabling": "TWO_FA_START_FIRST",
  "Two-factor authentication isn't enabled": "TWO_FA_NOT_ENABLED",
  "Your password is required to disable 2FA": "TWO_FA_PASSWORD_REQUIRED",
  "Password is incorrect": "PASSWORD_INCORRECT",
  "A valid authentication code is required to disable 2FA": "TWO_FA_CODE_REQUIRED",
  "Enable two-factor authentication first": "TWO_FA_ENABLE_FIRST",
  "Too many attempts. Request a new code.": "TOO_MANY_ATTEMPTS",
  "Missing reset token": "MISSING_RESET_TOKEN",
  "This reset link is invalid or has expired": "RESET_LINK_INVALID",
  "Gold tracking isn't configured": "GOLD_NOT_CONFIGURED",
};

function codeFor(err: HttpError): string | undefined {
  return err.code ?? MESSAGE_CODES[err.message];
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_FAILED",
      details: err.flatten(),
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, code: codeFor(err), params: err.params });
  }
  const message = err instanceof Error ? err.message : "Internal server error";
  // eslint-disable-next-line no-console
  console.error("[error]", err);
  return res.status(500).json({ error: message, code: "INTERNAL" });
}
