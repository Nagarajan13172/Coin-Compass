import {
  Google,
  GitHub,
  MicrosoftEntraId,
  Apple,
  type OAuth2Tokens,
} from "arctic";
import type { Request } from "express";
import { env } from "../config/env";
import { AUTH_PROVIDERS, type AuthProvider } from "../models/User";
import { HttpError } from "../middleware/errorHandler";

export interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

/** google/microsoft use PKCE (a code verifier must be replayed at the callback). */
export const USES_PKCE: Record<AuthProvider, boolean> = {
  google: true,
  microsoft: true,
  github: false,
  apple: false,
};

export function isAuthProvider(x: string): x is AuthProvider {
  return (AUTH_PROVIDERS as readonly string[]).includes(x);
}

export function isConfigured(provider: AuthProvider): boolean {
  return env.oauth[provider].configured;
}

function firstHeaderValue(value: string | undefined): string | null {
  const first = value?.split(",")[0]?.trim();
  return first ? first : null;
}

function parseOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function publicAuthOrigin(req: Request): string {
  const configuredOrigin = parseOrigin(env.oauthRedirectBaseUrl);
  if (configuredOrigin) return configuredOrigin;

  const forwardedProto = firstHeaderValue(req.get("x-forwarded-proto") ?? undefined);
  const forwardedHost = firstHeaderValue(req.get("x-forwarded-host") ?? undefined);
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const origin = parseOrigin(req.get("origin") ?? undefined);
  if (origin) return origin;

  const refererOrigin = parseOrigin(req.get("referer") ?? undefined);
  if (refererOrigin) return refererOrigin;

  const host = firstHeaderValue(req.get("host") ?? undefined);
  if (host) return `${req.protocol}://${host}`;

  return parseOrigin(env.serverUrl) ?? env.serverUrl;
}

export function oauthRedirectUri(req: Request, provider: AuthProvider): string {
  return new URL(`/api/auth/oauth/${provider}/callback`, `${publicAuthOrigin(req)}/`).toString();
}

function assertReady(provider: AuthProvider) {
  if (!isConfigured(provider)) throw new HttpError(400, `${provider} sign-in is not configured`);
}

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1] ?? "";
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return new Uint8Array(Buffer.from(body, "base64"));
}

// ---- arctic client factories ----
function google(redirectUri: string) {
  return new Google(env.oauth.google.clientId, env.oauth.google.clientSecret, redirectUri);
}
function github(redirectUri: string) {
  return new GitHub(env.oauth.github.clientId, env.oauth.github.clientSecret, redirectUri);
}
function microsoft(redirectUri: string) {
  const tenant = (env.oauth.microsoft as { tenant?: string }).tenant ?? "common";
  return new MicrosoftEntraId(tenant, env.oauth.microsoft.clientId, env.oauth.microsoft.clientSecret, redirectUri);
}
function apple(redirectUri: string) {
  const a = env.oauth.apple as { teamId?: string; keyId?: string; privateKey?: string };
  return new Apple(
    env.oauth.apple.clientId,
    a.teamId ?? "",
    a.keyId ?? "",
    pemToDer(a.privateKey ?? ""),
    redirectUri
  );
}

export function createAuthorizationUrl(
  provider: AuthProvider,
  state: string,
  codeVerifier: string,
  req: Request
): URL {
  assertReady(provider);
  const redirectUri = oauthRedirectUri(req, provider);
  switch (provider) {
    case "google":
      return google(redirectUri).createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
    case "microsoft":
      return microsoft(redirectUri).createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]);
    case "github":
      return github(redirectUri).createAuthorizationURL(state, ["read:user", "user:email"]);
    case "apple": {
      const url = apple(redirectUri).createAuthorizationURL(state, ["name", "email"]);
      // Apple requires form_post when name/email scopes are requested.
      url.searchParams.set("response_mode", "form_post");
      return url;
    }
  }
}

async function validate(provider: AuthProvider, code: string, codeVerifier: string, req: Request): Promise<OAuth2Tokens> {
  const redirectUri = oauthRedirectUri(req, provider);
  switch (provider) {
    case "google":
      return google(redirectUri).validateAuthorizationCode(code, codeVerifier);
    case "microsoft":
      return microsoft(redirectUri).validateAuthorizationCode(code, codeVerifier);
    case "github":
      return github(redirectUri).validateAuthorizationCode(code);
    case "apple":
      return apple(redirectUri).validateAuthorizationCode(code);
  }
}

/** GitHub has no id_token; fetch the profile + a verified primary email via its REST API. */
async function githubProfile(tokens: OAuth2Tokens): Promise<OAuthProfile> {
  const headers = { Authorization: `Bearer ${tokens.accessToken()}`, "User-Agent": "coincompass", Accept: "application/vnd.github+json" };
  const user = (await (await fetch("https://api.github.com/user", { headers })).json()) as Record<string, unknown>;
  let email: string | null = (user.email as string) ?? null;
  let emailVerified = false;
  const emails = (await (await fetch("https://api.github.com/user/emails", { headers })).json()) as
    | { email: string; primary: boolean; verified: boolean }[]
    | undefined;
  if (Array.isArray(emails)) {
    const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
    if (primary) {
      email = primary.email;
      emailVerified = true;
    }
  }
  return {
    providerAccountId: String(user.id),
    email,
    emailVerified,
    name: (user.name as string) ?? (user.login as string) ?? null,
    avatarUrl: (user.avatar_url as string) ?? null,
  };
}

/** Exchange the authorization code and return a normalized profile. */
export async function exchangeAndGetProfile(
  provider: AuthProvider,
  code: string,
  codeVerifier: string,
  req: Request
): Promise<OAuthProfile> {
  assertReady(provider);
  const tokens = await validate(provider, code, codeVerifier, req);

  if (provider === "github") return githubProfile(tokens);

  // google / microsoft / apple are OIDC → read claims from the id_token.
  const claims = decodeJwt(tokens.idToken());
  const email = (claims.email as string) ?? (claims.preferred_username as string) ?? null;
  let name = (claims.name as string) ?? null;

  // Apple sends the display name only on first consent, in the POSTed `user` field.
  if (provider === "apple" && !name && typeof req.body?.user === "string") {
    try {
      const parsed = JSON.parse(req.body.user) as { name?: { firstName?: string; lastName?: string } };
      const full = [parsed.name?.firstName, parsed.name?.lastName].filter(Boolean).join(" ");
      if (full) name = full;
    } catch {
      /* ignore malformed user payload */
    }
  }

  return {
    providerAccountId: String(claims.sub ?? claims.oid ?? ""),
    email,
    emailVerified:
      claims.email_verified === true || claims.email_verified === "true" || (provider === "microsoft" && Boolean(email)),
    name,
    avatarUrl: (claims.picture as string) ?? null,
  };
}
