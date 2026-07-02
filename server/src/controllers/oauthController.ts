import type { CookieOptions, Request, Response } from "express";
import { generateState, generateCodeVerifier } from "arctic";
import { env } from "../config/env";
import {
  isAuthProvider,
  isConfigured,
  USES_PKCE,
  createAuthorizationUrl,
  exchangeAndGetProfile,
  oauthRedirectUri,
} from "../auth/oauthProviders";
import { findOrCreateOAuthUser } from "../services/authService";
import { setSessionCookie } from "../auth/cookie";
import { setPendingCookie } from "../auth/pending2fa";
import type { AuthProvider } from "../models/User";
import { HttpError } from "../middleware/errorHandler";
import { publicAppOrigin } from "../utils/publicOrigin";

const STATE_COOKIE = "mt_oauth_state";
const VERIFIER_COOKIE = "mt_oauth_verifier";

/**
 * Apple posts the callback cross-site (form_post), so its temp cookies need
 * SameSite=None+Secure to survive; the others use Lax (top-level GET redirect).
 */
function tempCookieOpts(provider: AuthProvider): CookieOptions {
  const crossSite = provider === "apple";
  return {
    httpOnly: true,
    secure: env.isProd || crossSite,
    sameSite: crossSite ? "none" : "lax",
    path: "/",
    maxAge: 10 * 60 * 1000,
  };
}

function parseProvider(req: Request): AuthProvider {
  const p = req.params.provider;
  if (!isAuthProvider(p)) throw new HttpError(404, "Unknown auth provider");
  return p;
}

export async function oauthStart(req: Request, res: Response) {
  const provider = parseProvider(req);
  if (!isConfigured(provider)) {
    return res.redirect(`${publicAppOrigin(req)}/login?error=oauth_unconfigured`);
  }
  const state = generateState();
  const codeVerifier = USES_PKCE[provider] ? generateCodeVerifier() : "";
  const redirectUri = oauthRedirectUri(req, provider);
  const authorizationUrl = createAuthorizationUrl(provider, state, codeVerifier, req).toString();
  const opts = tempCookieOpts(provider);
  res.cookie(STATE_COOKIE, state, opts);
  if (codeVerifier) res.cookie(VERIFIER_COOKIE, codeVerifier, opts);
  if (!env.isProd) {
    res.setHeader("x-oauth-redirect-uri", redirectUri);
    // eslint-disable-next-line no-console
    console.log(`[oauth] ${provider} redirect_uri=${redirectUri}`);
  }
  res.redirect(authorizationUrl);
}

export async function oauthCallback(req: Request, res: Response) {
  const provider = parseProvider(req);
  const params = (req.method === "POST" ? req.body : req.query) as Record<string, unknown>;
  const code = String(params.code ?? "");
  const state = String(params.state ?? "");
  const stateCookie = req.cookies?.[STATE_COOKIE];
  const verifier = req.cookies?.[VERIFIER_COOKIE] ?? "";

  // One-time cookies — always clear them.
  res.clearCookie(STATE_COOKIE, { path: "/" });
  res.clearCookie(VERIFIER_COOKIE, { path: "/" });

  try {
    if (!code || !state || !stateCookie || state !== stateCookie) {
      throw new HttpError(400, "Invalid OAuth state");
    }
    if (USES_PKCE[provider] && !verifier) throw new HttpError(400, "Missing PKCE verifier");

    const profile = await exchangeAndGetProfile(provider, code, verifier, req);
    const user = await findOrCreateOAuthUser({ provider, ...profile });
    // Enforce 2FA on OAuth logins too: issue the pending cookie and bounce to the
    // verify step instead of a full session when the account has 2FA enabled.
    if (user.twoFactorEnabled) {
      setPendingCookie(res, String(user._id), true);
      res.redirect(`${publicAppOrigin(req)}/login/2fa`);
      return;
    }
    setSessionCookie(res, String(user._id));
    res.redirect(`${publicAppOrigin(req)}/`);
  } catch {
    res.redirect(`${publicAppOrigin(req)}/login?error=oauth`);
  }
}
