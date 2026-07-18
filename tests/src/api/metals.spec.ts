import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";
import { newSession } from "../harness/http";

/**
 * The test server runs with METALS_ENABLED=false, so the metals feature is
 * disabled (and the suite never scrapes the live GRT site). These assert the
 * graceful "not configured" behaviour. With the feature enabled, latest/history
 * return data and refresh returns a fresh GRT snapshot subject to the cooldown.
 */

describe("Metals — read (feature disabled without an API key)", () => {
  it("latest reports configured:false with null snapshots", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.get("/metals/latest");
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ configured: false });
    expect(res.data.gold).toBeNull();
    expect(res.data.silver).toBeNull();
  });

  it("history returns an array for gold and silver", async () => {
    const u = await createVerifiedUser();
    expect(Array.isArray((await u.session.http.get("/metals/history")).data)).toBe(true);
    expect(Array.isArray((await u.session.http.get("/metals/history?metal=silver")).data)).toBe(true);
  });

  it("on-demand refresh 400s when gold tracking isn't configured", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/metals/refresh")).status).toBe(400);
  });

  it("requires authentication", async () => {
    expect((await newSession().http.get("/metals/latest")).status).toBe(401);
  });
});
