import { afterEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { env } from "../config/env";
import { hashPassword, verifyPassword, needsRehash, pepperEnabled } from "./password";

const originalPepper = env.auth.passwordPepper;
afterEach(() => {
  env.auth.passwordPepper = originalPepper;
});

describe("password hashing without a pepper", () => {
  it("round-trips and rejects the wrong password", async () => {
    env.auth.passwordPepper = "";
    const hash = await hashPassword("correct horse");
    expect(hash.startsWith("$2")).toBe(true); // plain bcrypt, no tag
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false); // nothing to upgrade to
  });
});

describe("password hashing with a pepper", () => {
  it("tags peppered hashes and round-trips", async () => {
    env.auth.passwordPepper = "unit-test-pepper-key";
    const hash = await hashPassword("correct horse");
    expect(hash.startsWith("pmac1$")).toBe(true);
    expect(await verifyPassword("correct horse", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("still verifies a legacy (un-peppered) hash and flags it for upgrade", async () => {
    env.auth.passwordPepper = "unit-test-pepper-key";
    const legacy = await bcrypt.hash("correct horse", 12); // hash created before the pepper
    expect(await verifyPassword("correct horse", legacy)).toBe(true);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("cannot verify a peppered hash once the pepper is removed", async () => {
    env.auth.passwordPepper = "unit-test-pepper-key";
    const hash = await hashPassword("correct horse");
    env.auth.passwordPepper = ""; // pepper lost / not configured
    expect(pepperEnabled()).toBe(false);
    expect(await verifyPassword("correct horse", hash)).toBe(false);
  });

  it("is bound to the exact pepper value", async () => {
    env.auth.passwordPepper = "pepper-A";
    const hash = await hashPassword("correct horse");
    env.auth.passwordPepper = "pepper-B";
    expect(await verifyPassword("correct horse", hash)).toBe(false);
  });
});
