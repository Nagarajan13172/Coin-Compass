import rateLimit from "express-rate-limit";

/**
 * Brute-force protection for the credential endpoints. Keyed per IP. The 429
 * body uses the same `{ error }` shape as the rest of the API so the client
 * surfaces it like any other failure. These are the first rate limiters in the
 * app — the 2FA verify endpoints in particular guard a low-entropy 6-digit code.
 */
function makeLimiter(windowMs: number, limit: number, message: string) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    // Don't crash if a reverse-proxy setup can't be validated; we degrade to
    // limiting by the socket address instead.
    validate: { trustProxy: false, xForwardedForHeader: false },
    handler: (_req, res) => res.status(429).json({ error: message }),
  });
}

/** Password login: modest ceiling — a real user retries a handful of times. */
export const loginLimiter = makeLimiter(
  15 * 60 * 1000,
  10,
  "Too many sign-in attempts. Please wait a few minutes and try again."
);

/** 2FA code verification: tighter, since the search space is only a 6-digit code. */
export const twoFactorVerifyLimiter = makeLimiter(
  15 * 60 * 1000,
  8,
  "Too many attempts. Please wait a few minutes and try again."
);

/** Emailed OTP sends: prevent mailbox flooding. */
export const twoFactorEmailLimiter = makeLimiter(
  15 * 60 * 1000,
  5,
  "Too many code requests. Please wait a few minutes before requesting another."
);
