import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PeriodKey, Transaction, TxnType } from "@/lib/types";

type Theme = "light" | "dark" | "system";

interface UIState {
  // theme
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (t: Theme) => void;
  applyTheme: () => void;

  // currency config (hydrated from settings query)
  baseCurrency: string;
  currencySymbol: string;
  locale: string;
  setCurrencyConfig: (cfg: { baseCurrency: string; symbol: string; locale: string }) => void;

  // global period (dashboard / reports)
  period: PeriodKey;
  setPeriod: (p: PeriodKey) => void;

  // sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // add/edit transaction sheet
  txnSheetOpen: boolean;
  editingTxn: Transaction | null;
  defaultTxnType: TxnType;
  /** Prefill for a brand-new transaction (e.g. context-aware Add from active filters). */
  txnPrefill: { account?: string | null; category?: string | null } | null;
  openTxnSheet: (opts?: {
    txn?: Transaction;
    type?: TxnType;
    prefill?: { account?: string | null; category?: string | null };
  }) => void;
  closeTxnSheet: () => void;

  // pin lock
  locked: boolean;
  setLocked: (b: boolean) => void;
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: "system",
      resolvedTheme: systemPrefersDark() ? "dark" : "light",
      setTheme: (t) => {
        set({ theme: t });
        get().applyTheme();
      },
      applyTheme: () => {
        const { theme } = get();
        const resolved = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
        const root = document.documentElement;
        root.classList.toggle("dark", resolved === "dark");
        set({ resolvedTheme: resolved });
      },

      baseCurrency: "INR",
      currencySymbol: "₹",
      locale: "en-IN",
      setCurrencyConfig: (cfg) =>
        set({ baseCurrency: cfg.baseCurrency, currencySymbol: cfg.symbol, locale: cfg.locale }),

      period: "month",
      setPeriod: (p) => set({ period: p }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      txnSheetOpen: false,
      editingTxn: null,
      defaultTxnType: "expense",
      txnPrefill: null,
      openTxnSheet: (opts) =>
        set({
          txnSheetOpen: true,
          editingTxn: opts?.txn ?? null,
          defaultTxnType: opts?.txn?.type ?? opts?.type ?? "expense",
          txnPrefill: opts?.txn ? null : opts?.prefill ?? null,
        }),
      closeTxnSheet: () => set({ txnSheetOpen: false, editingTxn: null, txnPrefill: null }),

      locked: false,
      setLocked: (b) => set({ locked: b }),
    }),
    {
      name: "money-tracker-ui",
      partialize: (s) => ({
        theme: s.theme,
        period: s.period,
        sidebarCollapsed: s.sidebarCollapsed,
      }),
    }
  )
);
