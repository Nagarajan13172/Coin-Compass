import { describe, expect, it } from "vitest";
import { env } from "../config/env";
import { oauthRedirectUri } from "./oauthProviders";

function makeRequest(headers: Record<string, string | undefined>, protocol = "http") {
  return {
    protocol,
    get(name: string) {
      return headers[name.toLowerCase()];
    },
  } as const;
}

describe("oauthRedirectUri", () => {
  const originalRedirectBaseUrl = env.oauthRedirectBaseUrl;

  it("prefers forwarded headers for proxied deployments", () => {
    env.oauthRedirectBaseUrl = "";
    const req = makeRequest({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "money.example.com",
      host: "localhost:4000",
    });

    expect(oauthRedirectUri(req as never, "google")).toBe(
      "https://money.example.com/api/auth/oauth/google/callback"
    );
  });

  it("uses the explicit redirect base URL when configured", () => {
    env.oauthRedirectBaseUrl = "http://localhost:4000";
    const req = makeRequest({
      host: "localhost:4000",
      referer: "http://localhost:5173/login",
    });

    expect(oauthRedirectUri(req as never, "google")).toBe(
      "http://localhost:4000/api/auth/oauth/google/callback"
    );
  });

  it("restores the original test environment", () => {
    env.oauthRedirectBaseUrl = originalRedirectBaseUrl;
    const req = makeRequest({
      host: "localhost:4000",
    });

    expect(oauthRedirectUri(req as never, "google")).toBe(
      `${originalRedirectBaseUrl || "http://localhost:4000"}/api/auth/oauth/google/callback`
    );
  });
});
