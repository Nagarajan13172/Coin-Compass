import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * Groups — a named set of people you regularly split with ("Flatmates").
 *
 * Deliberately a shortcut over People, never a second ledger: picking a group
 * drops its members into a split as ordinary participants, and nothing about a
 * group can move money. These specs pin that boundary as much as the CRUD.
 */

const groups = async (u: TestUser) => (await u.session.http.get("/people/groups")).data;
const people = async (u: TestUser) => (await u.session.http.get("/people")).data;
const names = (g: any) => g.members.map((m: any) => m.name).sort();

describe("Groups — CRUD", () => {
  it("creates a group from typed names, making the people as it goes", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }, { name: "Meera" }, { name: "Arjun" }],
    });
    expect(res.status).toBe(201);
    expect(res.data.name).toBe("Flatmates");
    expect(names(res.data)).toEqual(["Arjun", "Meera", "Ravi"]);
    // The members are real Person records, reusable everywhere else.
    expect((await people(u)).length).toBe(3);
  });

  it("creates a group from people who already exist, without duplicating them", async () => {
    const u = await createVerifiedUser();
    const ravi = (await u.session.http.post("/people", { name: "Ravi" })).data;
    await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ personId: ravi._id }, { name: "ravi" }, { name: "Meera" }],
    });
    // "ravi" resolves to the SAME person, and a person can only be in a group once.
    expect((await people(u)).length).toBe(2);
    expect(names((await groups(u))[0])).toEqual(["Meera", "Ravi"]);
  });

  it("lists groups alphabetically with their members", async () => {
    const u = await createVerifiedUser();
    for (const name of ["Trip", "Flatmates"]) {
      await u.session.http.post("/people/groups", { name, members: [{ name: "Ravi" }] });
    }
    expect((await groups(u)).map((g: any) => g.name)).toEqual(["Flatmates", "Trip"]);
  });

  it("renames a group and replaces its members", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }],
    })).data;

    const res = await u.session.http.patch(`/people/groups/${g._id}`, {
      name: "Old flat",
      members: [{ name: "Meera" }, { name: "Arjun" }],
    });
    expect(res.status).toBe(200);
    expect(res.data.name).toBe("Old flat");
    expect(names(res.data)).toEqual(["Arjun", "Meera"]);
  });

  it("adds one extra person to an existing group", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }, { name: "Meera" }],
    })).data;

    const members = g.members.map((m: any) => ({ personId: m._id }));
    const res = await u.session.http.patch(`/people/groups/${g._id}`, {
      members: [...members, { name: "Latecomer" }],
    });
    expect(names(res.data)).toEqual(["Latecomer", "Meera", "Ravi"]);
  });

  it("creates an empty group and fills it later", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/people/groups", { name: "Someday" })).data;
    expect(g.members).toEqual([]);
    const res = await u.session.http.patch(`/people/groups/${g._id}`, { members: [{ name: "Ravi" }] });
    expect(names(res.data)).toEqual(["Ravi"]);
  });

  it("deletes a group", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/people/groups", { name: "Temp", members: [{ name: "Ravi" }] })).data;
    expect((await u.session.http.delete(`/people/groups/${g._id}`)).status).toBe(200);
    expect((await groups(u)).length).toBe(0);
  });
});

describe("Groups — a group is only a shortcut", () => {
  it("deleting a group keeps every person and their balance", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/credits", { person: "Ravi", direction: "given", amount: 500 });
    const g = (await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }],
    })).data;

    await u.session.http.delete(`/people/groups/${g._id}`);

    expect((await people(u)).length).toBe(1);
    const rows = (await u.session.http.get("/credits/summary")).data;
    expect(rows[0]).toMatchObject({ person: "Ravi", net: 500 });
  });

  it("removing someone from a group leaves their balance untouched", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/credits", { person: "Ravi", direction: "given", amount: 500 });
    const g = (await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }, { name: "Meera" }],
    })).data;

    await u.session.http.patch(`/people/groups/${g._id}`, { members: [{ name: "Meera" }] });

    expect((await u.session.http.get("/credits/summary")).data[0]).toMatchObject({ person: "Ravi", net: 500 });
  });

  it("deleting a person removes them from their groups", async () => {
    const u = await createVerifiedUser();
    const g = (await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }, { name: "Meera" }],
    })).data;
    const ravi = (await people(u)).find((p: any) => p.name === "Ravi");

    await u.session.http.delete(`/people/${ravi._id}`);

    expect(names((await groups(u))[0])).toEqual(["Meera"]);
    expect(g.members.length).toBe(2); // the original response is unchanged, of course
  });

  it("merging two people leaves ONE of them in the group", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }, { name: "Ravi Kumar" }],
    });
    const rows = await people(u);
    const ravi = rows.find((p: any) => p.name === "Ravi");
    const raviKumar = rows.find((p: any) => p.name === "Ravi Kumar");

    await u.session.http.post(`/people/${ravi._id}/merge`, { into: raviKumar._id });

    expect(names((await groups(u))[0])).toEqual(["Ravi Kumar"]); // not listed twice
  });
});

describe("Groups — validation & ownership", () => {
  it("refuses a duplicate group name, case-insensitively (409)", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/people/groups", { name: "Flatmates" });
    const res = await u.session.http.post("/people/groups", { name: "  flatmates " });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("GROUP_EXISTS");
  });

  it("rejects a blank name (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/people/groups", { name: "   " })).status).toBe(400);
  });

  it("404s for another user's group", async () => {
    const owner = await createVerifiedUser();
    const g = (await owner.session.http.post("/people/groups", { name: "Mine" })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.patch(`/people/groups/${g._id}`, { name: "X" })).status).toBe(404);
    expect((await stranger.session.http.delete(`/people/groups/${g._id}`)).status).toBe(404);
    expect((await groups(stranger)).length).toBe(0);
  });

  it("404s when adding another user's person to your group", async () => {
    const owner = await createVerifiedUser();
    const theirs = (await owner.session.http.post("/people", { name: "Theirs" })).data;
    const stranger = await createVerifiedUser();
    const res = await stranger.session.http.post("/people/groups", {
      name: "Mine",
      members: [{ personId: theirs._id }],
    });
    expect(res.status).toBe(404);
  });

  it("the same group name for two DIFFERENT users is fine", async () => {
    const a = await createVerifiedUser();
    const b = await createVerifiedUser();
    expect((await a.session.http.post("/people/groups", { name: "Flatmates" })).status).toBe(201);
    expect((await b.session.http.post("/people/groups", { name: "Flatmates" })).status).toBe(201);
  });
});

describe("Groups — splitting with one", () => {
  it("a bill split across a group's members behaves like any other split", async () => {
    const u = await createVerifiedUser();
    const acc = (await u.session.http.post("/accounts", { name: "Bank", type: "bank", initialBalance: 50000 })).data;
    const g = (await u.session.http.post("/people/groups", {
      name: "Flatmates",
      members: [{ name: "Ravi" }, { name: "Meera" }, { name: "Arjun" }],
    })).data;

    // What the UI does with a group: turn its members into participants.
    const res = await u.session.http.post("/splits", {
      description: "Rent",
      totalAmount: 4000,
      yourShare: 1000,
      account: acc._id,
      participants: g.members.map((m: any) => ({ personId: m._id, person: m.name, amount: 1000 })),
    });
    expect(res.status).toBe(201);
    expect(res.data.participants).toHaveLength(3);

    const accounts = (await u.session.http.get("/accounts")).data;
    expect(accounts.find((a: any) => a.name === "Money Lent").balance).toBe(3000);
    expect((await u.session.http.get("/transactions/summary")).data.expense).toBe(1000);
    // Still three people — the group didn't create new ones.
    expect((await people(u)).length).toBe(3);
  });
});
