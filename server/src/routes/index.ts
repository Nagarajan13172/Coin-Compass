import express, { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth, requireVerified, requireWealthAccess } from "../middleware/auth";
import {
  loginLimiter,
  twoFactorVerifyLimiter,
  twoFactorEmailLimiter,
  wealthUnlockLimiter,
} from "../middleware/rateLimit";
import * as auth from "../controllers/authController";
import * as oauth from "../controllers/oauthController";
import * as accounts from "../controllers/accountController";
import * as categories from "../controllers/categoryController";
import * as transactions from "../controllers/transactionController";
import * as budgets from "../controllers/budgetController";
import * as goals from "../controllers/goalController";
import * as holdings from "../controllers/holdingController";
import * as loans from "../controllers/loanController";
import * as credits from "../controllers/creditController";
import * as networth from "../controllers/networthController";
import * as recurring from "../controllers/recurringController";
import * as notifications from "../controllers/notificationController";
import * as reports from "../controllers/reportController";
import * as metals from "../controllers/metalController";
import * as settings from "../controllers/settingsController";
import { getDashboard } from "../controllers/dashboardController";
import { exportCsv } from "../controllers/exportController";
import { importFile } from "../controllers/importController";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---- Public auth routes ----
router.post("/auth/signup", asyncHandler(auth.signup));
router.post("/auth/signin", loginLimiter, asyncHandler(auth.signin));
router.post("/auth/logout", asyncHandler(auth.logout));
// Two-factor login (pending) phase — gated by the short-lived mt_2fa cookie, not a session.
router.get("/auth/2fa/pending", asyncHandler(auth.twoFactorPending));
router.post("/auth/2fa/email", twoFactorEmailLimiter, asyncHandler(auth.sendTwoFactorEmail));
router.post("/auth/2fa/verify", twoFactorVerifyLimiter, asyncHandler(auth.verifyTwoFactor));
router.post("/auth/verify-email", asyncHandler(auth.verifyEmail));
router.post("/auth/forgot-password", asyncHandler(auth.forgotPassword));
router.post("/auth/reset-password", asyncHandler(auth.resetPassword));
router.get("/auth/providers", auth.providersStatus);
router.get("/auth/oauth/:provider", asyncHandler(oauth.oauthStart));
// Google/GitHub/Microsoft return via GET; Apple posts back (form_post) — accept both.
router.get("/auth/oauth/:provider/callback", asyncHandler(oauth.oauthCallback));
router.post(
  "/auth/oauth/:provider/callback",
  express.urlencoded({ extended: false }),
  asyncHandler(oauth.oauthCallback)
);

// ---- Requires a valid session (verified or not) ----
router.use(requireAuth);

router.get("/auth/me", asyncHandler(auth.me));
router.post("/auth/resend-verification", asyncHandler(auth.resendVerification));
router.post("/auth/change-password", asyncHandler(auth.changePassword));

// ---- Everything below additionally requires a verified email ----
router.use(asyncHandler(requireVerified));

// Two-factor management (enroll / enable / disable) for the signed-in account.
router.get("/auth/2fa/status", asyncHandler(auth.twoFactorStatus));
router.post("/auth/2fa/setup", asyncHandler(auth.twoFactorSetup));
router.post("/auth/2fa/enable", asyncHandler(auth.twoFactorEnable));
router.post("/auth/2fa/disable", asyncHandler(auth.twoFactorDisable));
router.post("/auth/2fa/email-fallback", asyncHandler(auth.twoFactorEmailFallback));
router.post("/auth/2fa/backup-codes", asyncHandler(auth.regenerateBackupCodes));

// Wealth (Net Worth) view: unlock to superadmin with the passcode, or re-lock.
router.post("/auth/unlock-wealth", wealthUnlockLimiter, asyncHandler(auth.unlockWealth));
router.post("/auth/lock-wealth", asyncHandler(auth.lockWealth));

// Accounts
router.get("/accounts", asyncHandler(accounts.listAccounts));
router.post("/accounts", asyncHandler(accounts.createAccount));
router.get("/accounts/:id", asyncHandler(accounts.getAccount));
router.patch("/accounts/:id", asyncHandler(accounts.updateAccount));
router.delete("/accounts/:id", asyncHandler(accounts.deleteAccount));

// Categories
router.get("/categories", asyncHandler(categories.listCategories));
router.post("/categories", asyncHandler(categories.createCategory));
router.patch("/categories/:id", asyncHandler(categories.updateCategory));
router.delete("/categories/:id", asyncHandler(categories.deleteCategory));

// Transactions
router.get("/transactions", asyncHandler(transactions.listTransactions));
router.get("/transactions/tags", asyncHandler(transactions.listTags));
router.get("/transactions/deleted", asyncHandler(transactions.listDeletedTransactions));
router.post("/transactions", asyncHandler(transactions.createTransaction));
router.get("/transactions/:id", asyncHandler(transactions.getTransaction));
router.patch("/transactions/:id", asyncHandler(transactions.updateTransaction));
router.post("/transactions/:id/restore", asyncHandler(transactions.restoreTransaction));
router.delete("/transactions/:id", asyncHandler(transactions.deleteTransaction));

// Budgets
router.get("/budgets", asyncHandler(budgets.listBudgets));
router.post("/budgets", asyncHandler(budgets.createBudget));
router.patch("/budgets/:id", asyncHandler(budgets.updateBudget));
router.delete("/budgets/:id", asyncHandler(budgets.deleteBudget));

// Recurring
router.get("/recurring", asyncHandler(recurring.listRecurring));
router.post("/recurring", asyncHandler(recurring.createRecurring));
router.post("/recurring/run", asyncHandler(recurring.runRecurring));
router.get("/recurring/:id/transactions", asyncHandler(recurring.listRecurringTransactions));
router.post("/recurring/:id/run", asyncHandler(recurring.runRecurringOne));
router.post("/recurring/:id/post-one", asyncHandler(recurring.postOneRecurring));
router.post("/recurring/:id/skip", asyncHandler(recurring.skipRecurring));
router.patch("/recurring/:id", asyncHandler(recurring.updateRecurring));
router.delete("/recurring/:id", asyncHandler(recurring.deleteRecurring));

// Notifications (in-app center) — system-generated; the client reads, marks, clears.
router.get("/notifications", asyncHandler(notifications.list));
router.post("/notifications/read-all", asyncHandler(notifications.readAll));
router.post("/notifications/:id/read", asyncHandler(notifications.readOne));
router.delete("/notifications/:id", asyncHandler(notifications.removeOne));
router.delete("/notifications", asyncHandler(notifications.removeAll));

// Goals
router.get("/goals", asyncHandler(goals.listGoals));
router.post("/goals", asyncHandler(goals.createGoal));
router.post("/goals/:id/contribute", asyncHandler(goals.contributeGoal));
router.patch("/goals/:id", asyncHandler(goals.updateGoal));
router.delete("/goals/:id", asyncHandler(goals.deleteGoal));

// Net worth: holdings (assets) + loans (liabilities). Holdings + net-worth trend are
// gated by the wealth lock; loans stay visible in the everyday view.
router.use("/holdings", asyncHandler(requireWealthAccess));
router.use("/networth", asyncHandler(requireWealthAccess));

router.get("/holdings", asyncHandler(holdings.listHoldings));
router.post("/holdings", asyncHandler(holdings.createHolding));
router.patch("/holdings/:id", asyncHandler(holdings.updateHolding));
router.delete("/holdings/:id", asyncHandler(holdings.deleteHolding));

router.get("/loans", asyncHandler(loans.listLoans));
router.post("/loans", asyncHandler(loans.createLoan));
router.post("/loans/:id/pay", asyncHandler(loans.payLoan));
router.post("/loans/:id/preclose", asyncHandler(loans.precloseLoan));
router.patch("/loans/:id", asyncHandler(loans.updateLoan));
router.delete("/loans/:id", asyncHandler(loans.deleteLoan));

// Credits: informal IOUs with friends/family, optionally linked to a real transaction.
router.get("/credits", asyncHandler(credits.listCreditsHandler));
router.get("/credits/summary", asyncHandler(credits.creditSummary));
router.post("/credits", asyncHandler(credits.createCreditHandler));
router.patch("/credits/:id", asyncHandler(credits.updateCreditHandler));
router.delete("/credits/:id", asyncHandler(credits.deleteCreditHandler));

// Net-worth trend: one snapshot per day, accumulated as the user visits.
router.get("/networth/history", asyncHandler(networth.netWorthHistory));

// Precious metals (gold/silver) — global daily rates
router.get("/metals/latest", asyncHandler(metals.latestMetals));
router.get("/metals/history", asyncHandler(metals.metalHistory));
router.post("/metals/refresh", asyncHandler(metals.refreshMetals));

// Reports
router.get("/reports/summary", asyncHandler(reports.summaryReport));
router.get("/reports/by-category", asyncHandler(reports.byCategoryReport));
router.get("/reports/trend", asyncHandler(reports.trendReport));
router.get("/reports/by-account", asyncHandler(reports.byAccountReport));
router.get("/reports/insights", asyncHandler(reports.insightsReport));
router.post("/reports/email-now", asyncHandler(reports.sendReportEmailNow));

// Dashboard
router.get("/dashboard", asyncHandler(getDashboard));

// Settings
router.get("/settings", asyncHandler(settings.getSettingsHandler));
router.put("/settings", asyncHandler(settings.updateSettingsHandler));
router.post("/settings/pin", asyncHandler(settings.setPin));
router.delete("/settings/pin", asyncHandler(settings.disablePin));
router.post("/settings/pin/verify", asyncHandler(settings.verifyPin));
// Wealth lock: setting/changing/disabling the passcode requires wealth access
// (first-time set passes because no lock exists yet).
router.post("/settings/wealth-passcode", asyncHandler(requireWealthAccess), asyncHandler(settings.setWealthPasscode));
router.delete("/settings/wealth-passcode", asyncHandler(requireWealthAccess), asyncHandler(settings.disableWealthPasscode));

// Export / Import
router.get("/export/csv", asyncHandler(exportCsv));
router.post(
  "/import",
  express.raw({ type: () => true, limit: "10mb" }),
  asyncHandler(importFile)
);

export default router;
