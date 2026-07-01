import { useEffect } from "react";
import { Routes, Route, Navigate, Outlet } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/layout/AppShell";
import { useUIStore } from "@/stores/ui";
import { useSettings } from "@/hooks/useSettings";
import { useMe } from "@/hooks/useAuth";
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
import LoginPage from "@/routes/LoginPage";
import SignupPage from "@/routes/SignupPage";
import VerifyEmailPage from "@/routes/VerifyEmailPage";

/** Hydrate per-user settings (currency, PIN) once authenticated. */
function AuthedBootstrap() {
  const setCurrencyConfig = useUIStore((s) => s.setCurrencyConfig);
  const setLocked = useUIStore((s) => s.setLocked);
  const { data: settings } = useSettings();

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

  return null;
}

function FullScreenSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

/** Gate the app on a session; redirect to /login when unauthenticated. */
function RequireAuth() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <FullScreenSplash />;
  if (!me) return <Navigate to="/login" replace />;
  // Signed in but email not confirmed → hold them at the verify screen.
  if (!me.emailVerified) return <Navigate to="/verify-email" replace />;
  return (
    <>
      <AuthedBootstrap />
      <PinLock />
      <Outlet />
    </>
  );
}

export function App() {
  const applyTheme = useUIStore((s) => s.applyTheme);

  // apply theme on mount + react to OS theme changes (no auth needed)
  useEffect(() => {
    applyTheme();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [applyTheme]);

  return (
    <TooltipProvider delayDuration={200}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<RequireAuth />}>
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
        </Route>
      </Routes>
      <Toaster />
    </TooltipProvider>
  );
}
