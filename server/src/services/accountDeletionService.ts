import type { Model } from "mongoose";
import { Account } from "../models/Account";
import { AuthIdentity } from "../models/AuthIdentity";
import { BackupCode } from "../models/BackupCode";
import { Budget } from "../models/Budget";
import { Category } from "../models/Category";
import { Credit } from "../models/Credit";
import { EmailVerificationToken } from "../models/EmailVerificationToken";
import { FundLot } from "../models/FundLot";
import { FundRedemption } from "../models/FundRedemption";
import { Goal } from "../models/Goal";
import { Holding } from "../models/Holding";
import { Loan } from "../models/Loan";
import { NetWorthSnapshot } from "../models/NetWorthSnapshot";
import { Notification } from "../models/Notification";
import { PasswordResetToken } from "../models/PasswordResetToken";
import { Person } from "../models/Person";
import { PersonGroup } from "../models/PersonGroup";
import { RecurringTransaction } from "../models/RecurringTransaction";
import { Settings } from "../models/Settings";
import { Split } from "../models/Split";
import { StockLot } from "../models/StockLot";
import { StockSale } from "../models/StockSale";
import { Template } from "../models/Template";
import { Transaction } from "../models/Transaction";
import { TwoFactorEmailCode } from "../models/TwoFactorEmailCode";
import { User } from "../models/User";
import { WealthResetCode } from "../models/WealthResetCode";
import { HttpError } from "../middleware/errorHandler";
import { verifyPassword } from "../auth/password";

/**
 * Closing an account, and taking the data with it.
 *
 * "Delete my account" has to mean it. A half-deleted account is worse than none:
 * the login is gone but the transactions, the holdings and the people are still
 * sitting in the database, belonging to a user who no longer exists and which
 * nobody can now export or remove.
 *
 * So the list below is explicit rather than inferred, and a test asserts that
 * every model carrying a `user` field appears in it. Adding a collection later
 * fails that test until someone decides — deliberately — whether deleting an
 * account should take it too.
 */

/**
 * Everything owned by one person. Shared and market-wide collections are
 * deliberately absent: Instrument, Fund, StockPrice, MetalPrice and
 * CorporateAction describe the world rather than the user, and are read by
 * everyone else on the server.
 */
export const USER_OWNED_MODELS: Model<unknown>[] = [
  Account,
  AuthIdentity,
  BackupCode,
  Budget,
  Category,
  Credit,
  EmailVerificationToken,
  FundLot,
  FundRedemption,
  Goal,
  Holding,
  Loan,
  NetWorthSnapshot,
  Notification,
  PasswordResetToken,
  Person,
  PersonGroup,
  RecurringTransaction,
  Settings,
  Split,
  StockLot,
  StockSale,
  Template,
  Transaction,
  TwoFactorEmailCode,
  WealthResetCode,
] as unknown as Model<unknown>[];

export interface DeletionInput {
  /** Typed back by the user. Proves they know which account they're closing. */
  email: string;
  /** Required whenever the account has one. A Google-only account has none. */
  password?: string;
}

/**
 * Check that the person asking is the person leaving.
 *
 * Two proofs, because they cover different mistakes. The password proves it's
 * them and not someone at their unlocked laptop; the typed email proves they
 * know which account this is — the thing that goes wrong when somebody has a
 * personal and a shared workspace open in two tabs.
 */
async function requireDeletionConsent(uid: string, input: DeletionInput) {
  const user = await User.findById(uid);
  if (!user) throw new HttpError(401, "Not authenticated");

  if (input.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new HttpError(400, "That isn't the email on this account", "EMAIL_MISMATCH");
  }

  if (user.passwordHash) {
    if (!input.password) {
      throw new HttpError(400, "Your password is required", "PASSWORD_REQUIRED");
    }
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new HttpError(401, "That password is incorrect", "PASSWORD_INCORRECT");
  }

  return user;
}

/**
 * Delete the user and everything they own.
 *
 * The user document goes last. If a delete fails partway the login still works,
 * so the account can be exported and the deletion retried; the reverse would
 * strand the data with no way back in to reach it.
 */
export async function deleteUserAccount(uid: string, input: DeletionInput) {
  const user = await requireDeletionConsent(uid, input);

  const removed: Record<string, number> = {};
  for (const model of USER_OWNED_MODELS) {
    const res = await model.deleteMany({ user: user._id });
    if (res.deletedCount) removed[model.modelName] = res.deletedCount;
  }

  await User.deleteOne({ _id: user._id });
  return { removed };
}
