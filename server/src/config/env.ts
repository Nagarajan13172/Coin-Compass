import dotenv from "dotenv";

dotenv.config();

const port = Number(process.env.PORT ?? 4000);
const clientUrl = process.env.CLIENT_URL ?? "http://localhost:5173";

/** An OAuth provider is "configured" only when both id and secret are present. */
function oauthProvider(id?: string, secret?: string, extra: Record<string, string | undefined> = {}) {
  return { clientId: id ?? "", clientSecret: secret ?? "", configured: Boolean(id && secret), ...extra };
}

export const env = {
  port,
  mongoUri: process.env.MONGO_URI ?? "mongodb://localhost:27017/money-tracker",
  clientUrl,
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProd: process.env.NODE_ENV === "production",
  // Public base URLs. APP_URL is the browser-facing origin; SERVER_URL is the
  // direct backend origin when you need to hit the API without the frontend proxy.
  serverUrl: process.env.SERVER_URL ?? `http://localhost:${port}`,
  appUrl: process.env.APP_URL ?? clientUrl,
  // Optional explicit origin for OAuth callbacks. Use this when the redirect URI
  // registered with the provider must stay on a specific origin.
  oauthRedirectBaseUrl: process.env.OAUTH_REDIRECT_BASE_URL ?? "",
  auth: {
    jwtSecret: process.env.AUTH_JWT_SECRET ?? "dev-insecure-secret-change-me",
    cookieName: process.env.AUTH_COOKIE_NAME ?? "mt_session",
    sessionTtlDays: 30,
    emailTokenTtlHours: Number(process.env.AUTH_EMAIL_TOKEN_TTL_HOURS ?? 24),
  },
  mail: {
    // When SMTP isn't configured, the mailer logs verification links to the console
    // instead of sending — so signup/verify works out of the box in local dev.
    host: process.env.SMTP_HOST ?? "",
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587/STARTTLS
    user: process.env.SMTP_USER ?? "",
    pass: process.env.SMTP_PASS ?? "",
    from: process.env.MAIL_FROM ?? "Money Tracker <no-reply@moneytracker.local>",
    get configured() {
      return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    },
  },
  oauth: {
    google: oauthProvider(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET),
    github: oauthProvider(process.env.GITHUB_CLIENT_ID, process.env.GITHUB_CLIENT_SECRET),
    microsoft: oauthProvider(process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET, {
      tenant: process.env.MICROSOFT_TENANT ?? "common",
    }),
    apple: oauthProvider(process.env.APPLE_CLIENT_ID, process.env.APPLE_CLIENT_SECRET, {
      teamId: process.env.APPLE_TEAM_ID,
      keyId: process.env.APPLE_KEY_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY,
    }),
  },
};

export type OAuthProviderName = keyof typeof env.oauth;
