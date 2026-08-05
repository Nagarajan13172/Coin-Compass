import { describe, it, expect } from "vitest";
import { createVerifiedUser, type TestUser } from "../harness/users";

/**
 * People — the friends/family/colleagues that credits and splits are recorded
 * against. Before these existed a credit stored a typed name and the ledger
 * grouped by lowercased text, so "Ravi" and "Ravi Kumar" silently became two
 * half-balances. These specs pin the identity rules end to end.
 */

const INITIAL = 50_000;
const bank = async (u: TestUser) =>
  (await u.session.http.post("/accounts", { name: "Bank", type: "bank", initialBalance: INITIAL })).data;

const lend = (u: TestUser, body: Record<string, unknown>) =>
  u.session.http.post("/credits", { direction: "given", amount: 500, ...body });

const summary = async (u: TestUser) => (await u.session.http.get("/credits/summary")).data;
const people = async (u: TestUser) => (await u.session.http.get("/people")).data;

describe("People — CRUD", () => {
  it("creates a person (201) with a relation", async () => {
    const u = await createVerifiedUser();
    const res = await u.session.http.post("/people", { name: "Ravi Kumar", relation: "friend" });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Ravi Kumar", relation: "friend" });
  });

  it("defaults the relation to 'other'", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/people", { name: "Nobody" })).data.relation).toBe("other");
  });

  it("lists people alphabetically", async () => {
    const u = await createVerifiedUser();
    for (const name of ["Zara", "Arjun", "Meera"]) await u.session.http.post("/people", { name });
    expect((await people(u)).map((p: any) => p.name)).toEqual(["Arjun", "Meera", "Zara"]);
  });

  it("renames and re-tags a person", async () => {
    const u = await createVerifiedUser();
    const p = (await u.session.http.post("/people", { name: "Ravi" })).data;
    const res = await u.session.http.patch(`/people/${p._id}`, { name: "Ravi Kumar", relation: "family" });
    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({ name: "Ravi Kumar", relation: "family" });
  });

  it("deletes a person who has no entries", async () => {
    const u = await createVerifiedUser();
    const p = (await u.session.http.post("/people", { name: "Temp" })).data;
    expect((await u.session.http.delete(`/people/${p._id}`)).status).toBe(200);
    expect((await people(u)).length).toBe(0);
  });

  it("rejects a blank name (400)", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/people", { name: "   " })).status).toBe(400);
  });

  it("404s for another user's person", async () => {
    const owner = await createVerifiedUser();
    const p = (await owner.session.http.post("/people", { name: "Mine" })).data;
    const stranger = await createVerifiedUser();
    expect((await stranger.session.http.patch(`/people/${p._id}`, { name: "X" })).status).toBe(404);
    expect((await stranger.session.http.delete(`/people/${p._id}`)).status).toBe(404);
    expect((await people(stranger)).length).toBe(0);
  });
});

describe("People — one record per person", () => {
  it("refuses a duplicate name (409)", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/people", { name: "Ravi" });
    const res = await u.session.http.post("/people", { name: "Ravi" });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("PERSON_EXISTS");
  });

  it("treats case and spacing as the same person", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/people", { name: "Ravi Kumar" });
    for (const dupe of ["ravi kumar", "  RAVI KUMAR  ", "Ravi  Kumar"]) {
      expect((await u.session.http.post("/people", { name: dupe })).status).toBe(409);
    }
    expect((await people(u)).length).toBe(1);
  });

  it("keeps genuinely different names apart", async () => {
    const u = await createVerifiedUser();
    expect((await u.session.http.post("/people", { name: "Ravi" })).status).toBe(201);
    expect((await u.session.http.post("/people", { name: "Ravi Kumar" })).status).toBe(201);
    expect((await people(u)).length).toBe(2);
  });

  it("refuses a rename that collides with someone else (409)", async () => {
    const u = await createVerifiedUser();
    await u.session.http.post("/people", { name: "Ravi" });
    const b = (await u.session.http.post("/people", { name: "Meera" })).data;
    const res = await u.session.http.patch(`/people/${b._id}`, { name: "ravi" });
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("PERSON_EXISTS");
  });

  it("lets a person keep their own name on an unrelated edit", async () => {
    const u = await createVerifiedUser();
    const p = (await u.session.http.post("/people", { name: "Ravi" })).data;
    expect((await u.session.http.patch(`/people/${p._id}`, { name: "Ravi", relation: "family" })).status).toBe(200);
  });

  it("the same name for two DIFFERENT users is fine", async () => {
    const a = await createVerifiedUser();
    const b = await createVerifiedUser();
    expect((await a.session.http.post("/people", { name: "Ravi" })).status).toBe(201);
    expect((await b.session.http.post("/people", { name: "Ravi" })).status).toBe(201);
  });
});

describe("People — credits attach to a person record", () => {
  it("a credit typed with a NEW name creates the person automatically", async () => {
    const u = await createVerifiedUser();
    const res = await lend(u, { person: "Ravi" });
    expect(res.status).toBe(201);
    expect(res.data.personRef).toBeTruthy();
    expect((await people(u)).map((p: any) => p.name)).toEqual(["Ravi"]);
  });

  it("a credit for an existing name reuses that person, never a second record", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi" });
    await lend(u, { person: "ravi" });
    await lend(u, { person: "  RAVI  " });
    expect((await people(u)).length).toBe(1);
    expect((await summary(u)).length).toBe(1);
  });

  it("attaches to a person picked by id, whatever the display name sent", async () => {
    const u = await createVerifiedUser();
    const p = (await u.session.http.post("/people", { name: "Ravi Kumar" })).data;
    const res = await lend(u, { person: "typo", personId: p._id });
    expect(res.status).toBe(201);
    expect(String(res.data.personRef)).toBe(p._id);
    expect((await people(u)).length).toBe(1); // "typo" did NOT become a person
  });

  it("404s for a person id belonging to someone else", async () => {
    const owner = await createVerifiedUser();
    const p = (await owner.session.http.post("/people", { name: "Mine" })).data;
    const stranger = await createVerifiedUser();
    expect((await lend(stranger, { person: "X", personId: p._id })).status).toBe(404);
  });

  it("split participants become people too, one record each", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    const res = await u.session.http.post("/splits", {
      description: "KFC",
      totalAmount: 3000,
      yourShare: 500,
      account: acc._id,
      participants: ["Ravi", "Meera", "Arjun", "Kumar", "Divya"].map((person) => ({ person, amount: 500 })),
    });
    expect(res.status).toBe(201);
    expect((await people(u)).map((p: any) => p.name).sort()).toEqual([
      "Arjun",
      "Divya",
      "Kumar",
      "Meera",
      "Ravi",
    ]);
  });

  it("the same person in two splits is still ONE record and one balance", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    const split = (n: number) =>
      u.session.http.post("/splits", {
        description: `Bill ${n}`,
        totalAmount: 1000,
        yourShare: 500,
        account: acc._id,
        participants: [{ person: "Ravi", amount: 500 }],
      });
    await split(1);
    await split(2);
    expect((await people(u)).length).toBe(1);
    const rows = await summary(u);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ person: "Ravi", given: 1000, net: 1000 });
  });
});

describe("People — renaming reaches every past entry", () => {
  it("a rename re-labels the whole ledger without forking it", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi", amount: 500 });
    await lend(u, { person: "Ravi", amount: 300 });
    const p = (await people(u))[0];

    await u.session.http.patch(`/people/${p._id}`, { name: "Ravi Kumar" });

    const rows = await summary(u);
    expect(rows.length).toBe(1); // still ONE person…
    expect(rows[0]).toMatchObject({ person: "Ravi Kumar", given: 800, net: 800 }); // …under the new name
  });

  it("a rename doesn't move a rupee", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    await lend(u, { person: "Ravi", amount: 500, account: acc._id, reflected: true });
    const p = (await people(u))[0];
    await u.session.http.patch(`/people/${p._id}`, { name: "Ravi Kumar" });

    const accounts = (await u.session.http.get("/accounts")).data;
    expect(accounts.find((a: any) => a.name === "Bank").balance).toBe(INITIAL - 500);
    expect(accounts.find((a: any) => a.name === "Money Lent").balance).toBe(500);
  });
});

describe("People — merging duplicates", () => {
  it("folds one person's entries into another and removes the source", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi", amount: 500 });
    await lend(u, { person: "Ravi Kumar", amount: 300 });
    const rows = await people(u);
    const ravi = rows.find((p: any) => p.name === "Ravi");
    const raviKumar = rows.find((p: any) => p.name === "Ravi Kumar");

    const res = await u.session.http.post(`/people/${ravi._id}/merge`, { into: raviKumar._id });
    expect(res.status).toBe(200);
    expect(res.data.movedEntries).toBe(1);

    expect((await people(u)).length).toBe(1);
    const merged = await summary(u);
    expect(merged.length).toBe(1);
    expect(merged[0]).toMatchObject({ person: "Ravi Kumar", given: 800, net: 800 });
  });

  it("merging never changes the money, only who owes it", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    await lend(u, { person: "Ravi", amount: 500, account: acc._id, reflected: true });
    await lend(u, { person: "Ravi Kumar", amount: 300, account: acc._id, reflected: true });
    const before = (await u.session.http.get("/accounts")).data;

    const rows = await people(u);
    await u.session.http.post(`/people/${rows[0]._id}/merge`, { into: rows[1]._id });

    const after = (await u.session.http.get("/accounts")).data;
    const bal = (list: any[], name: string) => list.find((a: any) => a.name === name).balance;
    expect(bal(after, "Bank")).toBe(bal(before, "Bank"));
    expect(bal(after, "Money Lent")).toBe(bal(before, "Money Lent"));
  });

  it("rejects merging a person into themselves (400)", async () => {
    const u = await createVerifiedUser();
    const p = (await u.session.http.post("/people", { name: "Ravi" })).data;
    expect((await u.session.http.post(`/people/${p._id}/merge`, { into: p._id })).status).toBe(400);
  });

  it("404s when merging into someone else's person", async () => {
    const owner = await createVerifiedUser();
    const mine = (await owner.session.http.post("/people", { name: "Mine" })).data;
    const stranger = await createVerifiedUser();
    const theirs = (await stranger.session.http.post("/people", { name: "Theirs" })).data;
    expect((await owner.session.http.post(`/people/${mine._id}/merge`, { into: theirs._id })).status).toBe(404);
  });
});

describe("People — deleting someone who still has entries", () => {
  it("refuses without force (409) and reports how many entries", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi" });
    const p = (await people(u))[0];
    const res = await u.session.http.delete(`/people/${p._id}`);
    expect(res.status).toBe(409);
    expect(res.data.code).toBe("PERSON_IN_USE");
  });

  it("the refused delete leaves the person and their balance untouched", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi", amount: 500 });
    const p = (await people(u))[0];
    await u.session.http.delete(`/people/${p._id}`);
    expect((await people(u)).length).toBe(1);
    expect((await summary(u))[0]).toMatchObject({ person: "Ravi", net: 500 });
  });

  it("force keeps the entries and the money, falling back to the name snapshot", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    await lend(u, { person: "Ravi", amount: 500, account: acc._id, reflected: true });
    const p = (await people(u))[0];

    expect((await u.session.http.delete(`/people/${p._id}?force=true`)).status).toBe(200);
    expect((await people(u)).length).toBe(0);

    // The ledger still reads correctly from the name stored on the entry…
    const rows = await summary(u);
    expect(rows.length).toBe(1);
    expect(rows[0]).toMatchObject({ person: "Ravi", given: 500, net: 500 });
    // …and no money moved.
    const accounts = (await u.session.http.get("/accounts")).data;
    expect(accounts.find((a: any) => a.name === "Money Lent").balance).toBe(500);
  });
});

/**
 * Entries written BEFORE the People registry have no personRef. Until
 * `backfill:people` runs they must still land on the right person rather than
 * showing up as a second, phantom card beside the linked entries — which is
 * exactly what a duplicate would look like on the Credits page.
 *
 * Force-deleting a person leaves entries in precisely that state, so it doubles
 * as a way to produce legacy rows on demand.
 */
describe("People — legacy entries group with linked ones", () => {
  it("an unlinked entry shares a card with a later linked one", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi", amount: 500 });
    const p = (await people(u))[0];

    // Force-delete → the entry keeps its name but loses its personRef.
    await u.session.http.delete(`/people/${p._id}?force=true`);
    expect((await people(u)).length).toBe(0);

    // A NEW entry for the same name re-creates the person and links to it.
    await lend(u, { person: "Ravi", amount: 300 });

    const rows = await summary(u);
    expect(rows.length).toBe(1); // ONE card, not two
    expect(rows[0]).toMatchObject({ person: "Ravi", given: 800, net: 800 });
    expect(rows[0].entries.length).toBe(2);
  });

  it("matches a legacy entry case- and spacing-insensitively", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi  Kumar", amount: 500 });
    const p = (await people(u))[0];
    await u.session.http.delete(`/people/${p._id}?force=true`);

    await lend(u, { person: "ravi kumar", amount: 300 });

    const rows = await summary(u);
    expect(rows.length).toBe(1);
    expect(rows[0].net).toBe(800);
  });

  it("keeps a genuinely different name in its own card", async () => {
    const u = await createVerifiedUser();
    await lend(u, { person: "Ravi", amount: 500 });
    const p = (await people(u))[0];
    await u.session.http.delete(`/people/${p._id}?force=true`);

    await lend(u, { person: "Ravi Kumar", amount: 300 });

    const rows = await summary(u);
    expect(rows.length).toBe(2); // two people, correctly
    expect(rows.map((r: any) => r.person).sort()).toEqual(["Ravi", "Ravi Kumar"]);
  });
});

describe("People — settling up still nets correctly", () => {
  it("a repayment against a person record neutralizes, never becoming income", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    const p = (await u.session.http.post("/people", { name: "Ravi Kumar" })).data;

    await u.session.http.post("/credits", {
      person: "Ravi Kumar",
      personId: p._id,
      direction: "given",
      amount: 20_000,
      account: acc._id,
      reflected: true,
    });
    await u.session.http.post("/credits", {
      person: "Ravi Kumar",
      personId: p._id,
      direction: "received",
      amount: 20_000,
      account: acc._id,
      reflected: true,
    });

    const accounts = (await u.session.http.get("/accounts")).data;
    expect(accounts.find((a: any) => a.name === "Bank").balance).toBe(INITIAL);
    expect(accounts.find((a: any) => a.name === "Money Lent").balance).toBe(0);
    expect((await u.session.http.get("/transactions/summary")).data.income).toBe(0);
  });

  it("a repayment typed by name nets against a lend made by id — same person", async () => {
    const u = await createVerifiedUser();
    const acc = await bank(u);
    const p = (await u.session.http.post("/people", { name: "Ravi" })).data;
    await u.session.http.post("/credits", {
      person: "Ravi",
      personId: p._id,
      direction: "given",
      amount: 1000,
      account: acc._id,
      reflected: true,
    });
    // Typed, not picked — must resolve to the SAME person, so this neutralizes.
    await u.session.http.post("/credits", {
      person: "ravi",
      direction: "received",
      amount: 1000,
      account: acc._id,
      reflected: true,
    });

    expect((await u.session.http.get("/transactions/summary")).data.income).toBe(0);
    expect((await summary(u)).length).toBe(1);
  });
});
