import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

/**
 * Human-friendly phrase for how long until the limit window resets, plus the
 * raw seconds (for the Retry-After header and a client-side countdown).
 * e.g. { text: "12 minutes", seconds: 705 } or { text: "45 seconds", seconds: 45 }.
 */
function retryIn(resetTime?: Date): { text: string; seconds: number } {
  const ms = resetTime ? resetTime.getTime() - Date.now() : 0;
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  if (seconds <= 0) return { text: "a moment", seconds: 0 };
  if (seconds < 60) return { text: `${seconds} second${seconds === 1 ? "" : "s"}`, seconds };
  const minutes = Math.ceil(seconds / 60);
  return { text: `${minutes} minute${minutes === 1 ? "" : "s"}`, seconds };
}

/**
 * Brute-force protection for the credential endpoints. Keyed per IP. The 429
 * body uses the same `{ error }` shape as the rest of the API so the client
 * surfaces it like any other failure, and appends the actual time left in the
 * window (instead of a vague "a few minutes") so the user knows when to retry.
 * `retryAfterSeconds` + the standard `Retry-After` header let the client show a
 * live countdown if it wants to. These are the first rate limiters in the app —
 * the 2FA verify endpoints in particular guard a low-entropy 6-digit code.
 */
/** Shared 429 responder: same `{ error, retryAfterSeconds }` shape as the rest of the API. */
function limitHandler(message: string) {
  return (req: Request, res: Response) => {
    // express-rate-limit attaches req.rateLimit at runtime; type it locally
    // since the package's global Express augmentation isn't picked up here.
    const info = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
    const { text, seconds } = retryIn(info?.resetTime);
    if (seconds > 0) res.setHeader("Retry-After", String(seconds));
    res.status(429).json({
      error: `${message} Please try again in ${text}.`,
      retryAfterSeconds: seconds,
    });
  };
}

function makeLimiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // Don't crash if a reverse-proxy setup can't be validated; we degrade to
    // limiting by the socket address instead.
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: limitHandler(message),
  });
}

/** Password login: modest ceiling — a real user retries a handful of times. */
export const loginLimiter = makeLimiter(15 * 60 * 1000, 10, "Too many sign-in attempts.");

/** 2FA code verification: tighter, since the search space is only a 6-digit code. */
export const twoFactorVerifyLimiter = makeLimiter(15 * 60 * 1000, 8, "Too many attempts.");

/** Emailed OTP sends: prevent mailbox flooding. */
export const twoFactorEmailLimiter = makeLimiter(
  15 * 60 * 1000,
  5,
  "Too many code requests."
);

/**
 * Payment-ingest webhook: generous ceiling (real payments are infrequent), but
 * keyed by the ingest token rather than IP — a phone's IP changes constantly and
 * one user's captures shouldn't starve another's. Falls back to IP when no token.
 */
export const ingestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false, xForwardedForHeader: false },
  keyGenerator: (req: Request) => req.header("x-ingest-token") || req.ip || "ingest",
  handler: limitHandler("Too many payment captures."),
});
