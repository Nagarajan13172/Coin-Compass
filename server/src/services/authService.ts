import { Types } from "mongoose";
import { User, type AuthProvider } from "../models/User";
import { AuthIdentity } from "../models/AuthIdentity";
import { Settings } from "../models/Settings";
import { Account } from "../models/Account";
import { Category } from "../models/Category";
import { hashPassword, verifyPassword } from "../auth/password";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../seed/defaults";
import { HttpError } from "../middleware/errorHandler";

/**
 * Seed a brand-new user's workspace: their settings doc, the default income/expense
 * categories, and a starter "Cash" account. Runs on every signup (password or OAuth).
 */
export async function provisionUser(userId: Types.ObjectId | string): Promise<void> {
  const user = userId;
  await Settings.create({ user });

  const categories = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({ ...c, type: "expense", order: i, isDefault: true, user })),
    ...DEFAULT_INCOME_CATEGORIES.map((c, i) => ({ ...c, type: "income", order: i, isDefault: true, user })),
  ];
  await Category.insertMany(categories);

  await Account.create({ user, name: "Cash", type: "cash", icon: "wallet", color: "#2563EB" });
}

export async function signupWithPassword(input: { email: string; password: string; name?: string }) {
  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new HttpError(409, "An account with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const user = await User.create({ email, name: input.name ?? "", passwordHash });
  await provisionUser(user._id);
  return user;
}

export async function signinWithPassword(input: { email: string; password: string }) {
  const email = input.email.toLowerCase().trim();
  const user = await User.findOne({ email });
  // Generic message: don't reveal whether the email exists.
  if (!user || !user.passwordHash) throw new HttpError(401, "Invalid email or password");
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new HttpError(401, "Invalid email or password");
  return user;
}

/**
 * Resolve (or create) a local user from a verified OAuth profile.
 * Links to an existing account by verified email; otherwise provisions a new user.
 */
export async function findOrCreateOAuthUser(input: {
  provider: AuthProvider;
  providerAccountId: string;
  email?: string | null;
  emailVerified?: boolean;
  name?: string | null;
  avatarUrl?: string | null;
}) {
  // 1. Existing identity → return its user.
  const identity = await AuthIdentity.findOne({
    provider: input.provider,
    providerAccountId: input.providerAccountId,
  });
  if (identity) {
    const user = await User.findById(identity.user);
    if (user) return user;
  }

  // 2. Link by verified email to an existing local account.
  let user = null;
  if (input.email && input.emailVerified) {
    user = await User.findOne({ email: input.email.toLowerCase().trim() });
  }

  // 3. Otherwise create a fresh user + seed their workspace.
  if (!user) {
    if (!input.email) throw new HttpError(400, "This provider did not return an email address");
    user = await User.create({
      email: input.email.toLowerCase().trim(),
      name: input.name ?? "",
      avatarUrl: input.avatarUrl ?? "",
      emailVerified: Boolean(input.emailVerified),
    });
    await provisionUser(user._id);
  }

  // Record the identity so subsequent logins short-circuit at step 1.
  await AuthIdentity.updateOne(
    { provider: input.provider, providerAccountId: input.providerAccountId },
    { $setOnInsert: { user: user._id, provider: input.provider, providerAccountId: input.providerAccountId } },
    { upsert: true }
  );

  return user;
}
