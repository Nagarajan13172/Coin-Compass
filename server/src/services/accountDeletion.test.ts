import { describe, it, expect } from "vitest";
import mongoose from "mongoose";
import { USER_OWNED_MODELS } from "./accountDeletionService";

// Importing the route table registers every model with mongoose, so the check
// below sees the whole schema rather than only what this file happens to import.
import "../routes/index";

/**
 * The registry that "delete my account" walks.
 *
 * This is the test that matters for it. The deletion itself is a loop over a
 * hand-written list, and a hand-written list rots: someone adds a collection in
 * six months, never touches this file, and from then on closing an account
 * leaves their rows behind — belonging to a user who no longer exists, which
 * nobody can export or remove. So the list is checked against the schema.
 */

/** Collections that describe the world rather than a person. */
const SHARED = new Set([
  "Instrument",
  "Fund",
  "StockPrice",
  "MetalPrice",
  "CorporateAction",
  "User", // deleted explicitly, last, after everything it owns
]);

describe("account deletion — the registry", () => {
  it("covers every model that belongs to a user", () => {
    const listed = new Set(USER_OWNED_MODELS.map((m) => m.modelName));

    const owned = Object.entries(mongoose.models)
      .filter(([name, model]) => !SHARED.has(name) && Boolean(model.schema.path("user")))
      .map(([name]) => name);

    // Fails the day a new user-scoped collection appears, which is the point:
    // it forces a decision rather than letting the omission go unnoticed.
    // Guard against the check passing because it found nothing to check: if the
    // models never registered, `owned` would be empty and this would be green
    // no matter what the registry said.
    expect(owned.length).toBeGreaterThan(20);

    const missing = owned.filter((name) => !listed.has(name));
    expect(missing, `not deleted when an account closes: ${missing.join(", ")}`).toEqual([]);
  });

  it("never lists a shared collection", () => {
    // Deleting one person's account must not take the instrument universe, the
    // NAV history or the metal prices with it — every other user reads those.
    const listed = USER_OWNED_MODELS.map((m) => m.modelName);
    expect(listed.filter((name) => SHARED.has(name))).toEqual([]);
  });

  it("names each collection once", () => {
    const listed = USER_OWNED_MODELS.map((m) => m.modelName);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("only lists models that actually have a user field to match on", () => {
    // A deleteMany({ user }) against a model with no `user` path silently
    // matches nothing, which would look like success forever.
    for (const model of USER_OWNED_MODELS) {
      expect(Boolean(model.schema.path("user")), `${model.modelName} has no user field`).toBe(true);
    }
  });
});
