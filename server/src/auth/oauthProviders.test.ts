import { describe, expect, it } from "vitest";
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
  it("prefers forwarded headers for proxied deployments", () => {
    const req = makeRequest({
      "x-forwarded-proto": "https",
      "x-forwarded-host": "money.example.com",
      host: "localhost:4000",
    });

    expect(oauthRedirectUri(req as never, "google")).toBe(
      "https://money.example.com/api/auth/oauth/google/callback"
    );
  });

  it("falls back to the browser origin from the referer", () => {
    const req = makeRequest({
      host: "localhost:4000",
      referer: "http://localhost:5173/login",
    });

    expect(oauthRedirectUri(req as never, "google")).toBe(
      "http://localhost:5173/api/auth/oauth/google/callback"
    );
  });
});
