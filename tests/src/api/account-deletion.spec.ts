import { describe, it, expect } from "vitest";
import { createVerifiedUser } from "../harness/users";

/**
 * Closing an account.
 *
 * The thing under test is that "delete" means it — everything of theirs goes,
 * nothing of anyone else's does, and it can't happen by accident or by someone
 * who merely found the laptop unlocked.
 */

/** A user with something in every corner worth checking afterwards. */
async function userWithData() {
  const u = await createVerifiedUser();
  const account = (await u.session.http.post("/accounts", { name: "HDFC", type: "bank" })).data;
  const category = (await u.session.http.get("/categories")).data.find(
    (c: any) => c.type === "expense"
  );
  await u.session.http.post("/transactions", {
    type: "expense",
    amount: 500,
    account: account._id,
    category: category._id,
    date: new Date().toISOString(),
    note: "A spend that must not outlive the account",
  });
  await u.session.http.post("/goals", { name: "Car", targetAmount: 100000 });
  await u.session.http.post("/holdings", {
    name: "SBI FD",
    class: "saving",
    subtype: "fixed_deposit",
    value: 50000,
  });
  await u.session.http.post("/people", { name: "Rahul" });
  return { u, account };
}

describe("account deletion — what it takes", () => {
  it("removes the account and everything in it", async () => {
    const { u } = await userWithData();

    const res = await u.session.http.delete("/auth/account", {
      data: { email: u.email, password: u.password },
    });
    expect(res.status).toBe(200);
    // The report names what went, so a caller can see it did something.
    expect(res.data.removed.Transaction).toBeGreaterThan(0);
    expect(res.data.removed.Account).toBeGreaterThan(0);
    expect(res.data.removed.Settings).toBe(1);

    // The session is over: the cookie was cleared and the user is gone.
    expect((await u.session.http.get("/auth/me")).status).toBe(401);
    // And it can't be signed back into.
    const back = await u.session.http.post("/auth/signin", {
      email: u.email,
      password: u.password,
    });
    expect(back.status).toBe(401);
  });

  it("leaves everyone else's data exactly where it was", async () => {
    const leaving = await userWithData();
    const staying = await userWithData();

    await leaving.u.session.http.delete("/auth/account", {
      data: { email: leaving.u.email, password: leaving.u.password },
    });

    // The other user is untouched — same accounts, same transactions, same
    // holdings. A deleteMany with a missing filter would take these too.
    const accounts = (await staying.u.session.http.get("/accounts")).data;
    expect(accounts.some((a: any) => a.name === "HDFC")).toBe(true);
    const txns = (await staying.u.session.http.get("/transactions", { params: { limit: 50 } })).data;
    expect((txns.items ?? txns).length).toBeGreaterThan(0);
    expect((await staying.u.session.http.get("/holdings")).data).toHaveLength(1);
    expect((await staying.u.session.http.get("/auth/me")).status).toBe(200);
  });

  it("frees the email, so the address can be used again", async () => {
    const { u } = await userWithData();
    await u.session.http.delete("/auth/account", {
      data: { email: u.email, password: u.password },
    });

    // Nothing of the old account survives to collide with a new signup.
    const res = await u.session.http.post("/auth/signup", {
      email: u.email,
      password: "Different1!pass",
    });
    expect(res.status).toBe(201);
  });
});

describe("account deletion — what it refuses", () => {
  it("won't take a wrong password", async () => {
    const { u } = await userWithData();
    const res = await u.session.http.delete("/auth/account", {
      data: { email: u.email, password: "not-the-password" },
    });
    expect(res.status).toBe(401);
    expect(res.data.code).toBe("PASSWORD_INCORRECT");
    // Nothing was touched on the way to refusing.
    expect((await u.session.http.get("/accounts")).data.length).toBeGreaterThan(0);
    expect((await u.session.http.get("/auth/me")).status).toBe(200);
  });

  it("won't take no password at all from an account that has one", async () => {
    const { u } = await userWithData();
    const res = await u.session.http.delete("/auth/account", { data: { email: u.email } });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("PASSWORD_REQUIRED");
    expect((await u.session.http.get("/auth/me")).status).toBe(200);
  });

  it("won't take somebody else's email, however right the password is", async () => {
    const { u } = await userWithData();
    const other = await createVerifiedUser();

    // The typed email is the proof they know *which* account is closing — the
    // thing that goes wrong with two workspaces open in two tabs.
    const res = await u.session.http.delete("/auth/account", {
      data: { email: other.email, password: u.password },
    });
    expect(res.status).toBe(400);
    expect(res.data.code).toBe("EMAIL_MISMATCH");
    expect((await u.session.http.get("/auth/me")).status).toBe(200);
    expect((await other.session.http.get("/auth/me")).status).toBe(200);
  });

  it("won't do it for someone who isn't signed in", async () => {
    const { u } = await userWithData();
    const stranger = await createVerifiedUser();
    await stranger.session.http.post("/auth/logout");

    const res = await stranger.session.http.delete("/auth/account", {
      data: { email: u.email, password: u.password },
    });
    expect(res.status).toBe(401);
    expect((await u.session.http.get("/auth/me")).status).toBe(200);
  });
});
