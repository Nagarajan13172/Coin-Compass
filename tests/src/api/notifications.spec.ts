import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";
import { insertDoc, docCount } from "../harness/db";

/** The user's own id (system notifications are keyed to it). */
async function userIdOf(u: TestUser): Promise<string> {
  return (await u.session.http.get("/auth/me")).data.user.id as string;
}

/** Seed a system-generated notification directly (there is no create endpoint). */
async function seedNotification(
  userId: string,
  overrides: Record<string, unknown> = {}
): Promise<string> {
  return insertDoc("notifications", {
    user: userId,
    type: "recurring.posted",
    params: { count: 1, ruleTitle: "Rent", amount: 1000, currency: "INR", type: "expense" },
    link: "/recurring",
    read: false,
    readAt: null,
    dedupeKey: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

describe("Notifications — listing & unread", () => {
  it("lists the caller's notifications newest-first with an unread count", async () => {
    const u = await createVerifiedUser();
    const uid = await userIdOf(u);
    await seedNotification(uid);
    await seedNotification(uid, { type: "budget.exceeded", read: true, readAt: new Date() });

    const res = await u.session.http.get("/notifications");
    expect(res.status).toBe(200);
    expect(res.data.items).toHaveLength(2);
    expect(res.data.unread).toBe(1); // one seeded read, one unread
  });
});

describe("Notifications — read state", () => {
  it("marks a single notification read (unread drops)", async () => {
    const u = await createVerifiedUser();
    const uid = await userIdOf(u);
    const id = await seedNotification(uid);

    const read = await u.session.http.post(`/notifications/${id}/read`);
    expect(read.status).toBe(200);

    const after = (await u.session.http.get("/notifications")).data;
    expect(after.unread).toBe(0);
    expect(after.items.find((n: { _id: string }) => n._id === id).read).toBe(true);
  });

  it("marks all read", async () => {
    const u = await createVerifiedUser();
    const uid = await userIdOf(u);
    await seedNotification(uid);
    await seedNotification(uid, { type: "recurring.due_soon" });

    const res = await u.session.http.post("/notifications/read-all");
    expect(res.status).toBe(200);
    expect((await u.session.http.get("/notifications")).data.unread).toBe(0);
  });
});

describe("Notifications — clearing", () => {
  it("clears one and clears all (rows are actually deleted)", async () => {
    const u = await createVerifiedUser();
    const uid = await userIdOf(u);
    const id = await seedNotification(uid);
    await seedNotification(uid, { type: "balance.low" });

    expect((await u.session.http.delete(`/notifications/${id}`)).status).toBe(200);
    expect((await u.session.http.get("/notifications")).data.items).toHaveLength(1);

    expect((await u.session.http.delete("/notifications")).status).toBe(200);
    expect((await u.session.http.get("/notifications")).data.items).toHaveLength(0);
    expect(await docCount("notifications", { user: uid })).toBe(0);
  });
});

describe("Notifications — ownership", () => {
  it("hides and 404s another user's notification", async () => {
    const owner = await createVerifiedUser();
    const ownerId = await userIdOf(owner);
    const id = await seedNotification(ownerId);

    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.get("/notifications")).data.items).toHaveLength(0);
    expect((await stranger.session.http.post(`/notifications/${id}/read`)).status).toBe(404);
    expect((await stranger.session.http.delete(`/notifications/${id}`)).status).toBe(404);
  });
});
