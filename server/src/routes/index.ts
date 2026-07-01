import express, { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler";
import * as accounts from "../controllers/accountController";
import * as categories from "../controllers/categoryController";
import * as transactions from "../controllers/transactionController";
import * as budgets from "../controllers/budgetController";
import * as recurring from "../controllers/recurringController";
import * as reports from "../controllers/reportController";
import * as settings from "../controllers/settingsController";
import { getDashboard } from "../controllers/dashboardController";
import { exportCsv } from "../controllers/exportController";
import { importFile } from "../controllers/importController";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

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
router.post("/transactions", asyncHandler(transactions.createTransaction));
router.get("/transactions/:id", asyncHandler(transactions.getTransaction));
router.patch("/transactions/:id", asyncHandler(transactions.updateTransaction));
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
router.post("/recurring/:id/skip", asyncHandler(recurring.skipRecurring));
router.patch("/recurring/:id", asyncHandler(recurring.updateRecurring));
router.delete("/recurring/:id", asyncHandler(recurring.deleteRecurring));

// Reports
router.get("/reports/summary", asyncHandler(reports.summaryReport));
router.get("/reports/by-category", asyncHandler(reports.byCategoryReport));
router.get("/reports/trend", asyncHandler(reports.trendReport));
router.get("/reports/by-account", asyncHandler(reports.byAccountReport));

// Dashboard
router.get("/dashboard", asyncHandler(getDashboard));

// Settings
router.get("/settings", asyncHandler(settings.getSettingsHandler));
router.put("/settings", asyncHandler(settings.updateSettingsHandler));
router.post("/settings/pin", asyncHandler(settings.setPin));
router.delete("/settings/pin", asyncHandler(settings.disablePin));
router.post("/settings/pin/verify", asyncHandler(settings.verifyPin));

// Export / Import
router.get("/export/csv", asyncHandler(exportCsv));
router.post(
  "/import",
  express.raw({ type: () => true, limit: "10mb" }),
  asyncHandler(importFile)
);

export default router;
