# Authentication setup

Money Tracker supports email/password sign-up (with email verification) and social
login via Google, GitHub, Microsoft, and Apple. All of the code is already in place —
this doc covers the configuration you supply through `server/.env`.

Copy `server/.env.example` to `server/.env` and fill in the values you need.

---

## Email verification

New password accounts start **unverified**. On sign-up the user is logged in but
held on a "verify your email" screen; the app is unlocked once they click the link
in the email. (OAuth logins arrive already verified and skip this.)

### Sending real email (SMTP)

Set these in `.env`:

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=Money Tracker <you@gmail.com>
```

For **Gmail**, create an *App password* at
Google Account → Security → 2-Step Verification → App passwords, and use that as
`SMTP_PASS` (your normal password won't work). Any SMTP provider (Mailgun, Postmark,
SES, Resend-SMTP, etc.) works the same way.

### No SMTP? (local dev)

If `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` are blank, **no email is sent** — instead the
verification link is printed to the **server console**. Copy it into your browser to
verify. This lets the whole flow work locally without a mail account.

---

## OAuth providers

A provider's button only appears on the login/sign-up pages once **both** its client
id and secret are set. The callback (redirect) URL for every provider is:

```
{APP_URL}/api/auth/oauth/{provider}/callback
```

With the default `APP_URL=http://localhost:5173` that's, e.g.:

```
http://localhost:5173/api/auth/oauth/google/callback
```

> Register that exact URL with the provider. In production, set `APP_URL` to the
> public https origin where the SPA serves `/api`, then register the matching
> https callback.

### Google

1. <https://console.cloud.google.com/apis/credentials> → **Create credentials → OAuth client ID**.
2. Application type **Web application**.
3. Authorized redirect URI: `http://localhost:5173/api/auth/oauth/google/callback`.
4. Copy the client id/secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### GitHub

1. <https://github.com/settings/developers> → **New OAuth App**.
2. Homepage URL: `http://localhost:5173`.
3. Authorization callback URL: `http://localhost:5173/api/auth/oauth/github/callback`.
4. Generate a client secret; set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

### Microsoft (Entra ID)

1. <https://portal.azure.com> → **App registrations → New registration**.
2. Supported account types: pick "any account" for personal + work, or single-tenant.
3. Redirect URI (Web): `http://localhost:5173/api/auth/oauth/microsoft/callback`.
4. Create a client secret under **Certificates & secrets**.
5. Set `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET`; set `MICROSOFT_TENANT` to
   `common` (any account) or your tenant id.

### Apple

Sign in with Apple needs a paid Apple Developer account:

1. Create an **App ID** and a **Services ID** (this Services ID string is `APPLE_CLIENT_ID`,
   e.g. `com.yourapp.web`).
2. Enable "Sign in with Apple" on the Services ID and add the return URL
   `http://localhost:5173/api/auth/oauth/apple/callback` (Apple requires https in
   production and won't accept a bare `localhost` there — use a tunnel for testing).
3. Create a **Sign in with Apple key** (.p8) and note the Key ID and your Team ID.
4. Set `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`
   (paste the .p8 contents; newlines may be written as `\n`).

---

## Notes

- Social logins are linked to a local account by **verified** email — signing in with
  Google and later GitHub on the same verified address resolves to one account.
- Session is a JWT in an httpOnly cookie (`AUTH_COOKIE_NAME`), valid for 30 days.
- Always set a strong `AUTH_JWT_SECRET` outside local dev (`openssl rand -base64 48`).
