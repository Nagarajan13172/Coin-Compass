import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useUIStore } from "@/stores/ui";
import { useSettings } from "@/hooks/useSettings";
import { PinLock } from "@/features/settings/PinLock";

import DashboardPage from "@/routes/DashboardPage";
import TransactionsPage from "@/routes/TransactionsPage";
import AccountsPage from "@/routes/AccountsPage";
import BudgetsPage from "@/routes/BudgetsPage";
import ReportsPage from "@/routes/ReportsPage";
import CalendarPage from "@/routes/CalendarPage";
import RecurringPage from "@/routes/RecurringPage";
import CategoriesPage from "@/routes/CategoriesPage";
import SettingsPage from "@/routes/SettingsPage";
import NotFoundPage from "@/routes/NotFoundPage";

export function App() {
  const applyTheme = useUIStore((s) => s.applyTheme);
  const setCurrencyConfig = useUIStore((s) => s.setCurrencyConfig);
  const setLocked = useUIStore((s) => s.setLocked);
  const { data: settings } = useSettings();

  // apply theme on mount + react to OS theme changes
  useEffect(() => {
    applyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyTheme]);

  // hydrate currency config + pin lock from settings
  useEffect(() => {
    if (!settings) return;
    const cur = settings.currencies.find((c) => c.code === settings.baseCurrency);
    setCurrencyConfig({
      baseCurrency: settings.baseCurrency,
      symbol: cur?.symbol ?? "₹",
      locale: settings.locale,
    });
    if (settings.pinEnabled) setLocked(true);
  }, [settings, setCurrencyConfig, setLocked]);

  return (
    <TooltipProvider delayDuration={200}>
      <PinLock />
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/accounts" element={<AccountsPage />} />
          <Route path="/budgets" element={<BudgetsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/recurring" element={<RecurringPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}
