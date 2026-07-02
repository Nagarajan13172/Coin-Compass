import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

describe("Goals — CRUD", () => {
  it("creates a goal (201) with progress fields", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/goals", { name: "Vacation", targetAmount: 1000 });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Vacation", targetAmount: 1000, savedAmount: 0 });
    expect(res.data).toMatchObject({ remaining: 1000, percent: 0, complete: false });
  });

  it("lists goals", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/goals", { name: "G", targetAmount: 100 });
    const res = await u.session.http.get("/goals");
    expect(res.status).toBe(200);
    expect(res.data.length).toBeGreaterThanOrEqual(1);
  });

  it("updates a goal", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Old", targetAmount: 100 })).data;
    const res = await u.session.http.patch(`/goals/${g._id}`, { name: "New", targetAmount: 250 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: "New", targetAmount: 250 });
  });

  it("deletes a goal", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Temp", targetAmount: 100 })).data;
    expect((await u.session.http.delete(`/goals/${g._id}`)).status).toBe(200);
    expect((await u.session.http.delete(`/goals/${g._id}`)).status).toBe(404);
  });
});

describe("Goals — contributions", () => {
  it("adds a contribution and tracks progress", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Car", targetAmount: 1000 })).data;
    const res = await u.session.http.post(`/goals/${g._id}/contribute`, { amount: 400 });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ savedAmount: 400, percent: 40, complete: false });
  });

  it("marks the goal complete when saved reaches the target", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "Phone", targetAmount: 500 })).data;
    const res = await u.session.http.post(`/goals/${g._id}/contribute`, { amount: 500 });
    expect(res.data).toMatchObject({ complete: true, percent: 100 });
  });

  it("clamps saved to zero on an over-withdrawal", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/goals", { name: "X", targetAmount: 1000, savedAmount: 100 })).data;
    const res = await u.session.http.post(`/goals/${g._id}/contribute`, { amount: -500 });
    expect(res.data.savedAmount).toBe(0);
  });
});

describe("Goals — validation & ownership", () => {
  it("rejects a non-positive target with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/goals", { name: "Bad", targetAmount: 0 })).status).toBe(400);
  });

  it("rejects a blank name with 400", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/goals", { name: "", targetAmount: 100 })).status).toBe(400);
  });

  it("404s for another user's goal", async () => {
    const owner = await createVerifiedUser();
    const g = (await owner.session.http.post("/goals", { name: "Mine", targetAmount: 100 })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.post(`/goals/${g._id}/contribute`, { amount: 10 })).status).toBe(404);
    expect((await stranger.session.http.delete(`/goals/${g._id}`)).status).toBe(404);
  });
});
