import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AccountDatum,
  CategoryDatum,
  Dashboard,
  InsightsReport,
  Summary,
  TrendDatum,
} from "@/lib/types";

interface RangeParams {
  from?: string;
  to?: string;
  period?: string;
}

/** Send a summary report email to the signed-in user now (previews the scheduled ones). */
export function useSendReportEmail() {
  return useMutation({
    mutationFn: async (kind: "monthly" | "midmonth" = "midmonth") =>
      (await api.post<{ ok: boolean; sentTo: string }>(`/reports/email-now?kind=${kind}`)).data,
  });
}

export function useDashboard(period: string) {
  return useQuery({
    queryKey: ["dashboard", period],
    queryFn: async () => (await api.get<Dashboard>("/dashboard", { params: { period } })).data,
  });
}

export function useSummary(params: RangeParams) {
  return useQuery({
    queryKey: ["reports", "summary", params],
    queryFn: async () => (await api.get<Summary>("/reports/summary", { params })).data,
  });
}

export function useByCategory(params: RangeParams & { type?: "income" | "expense" }) {
  return useQuery({
    queryKey: ["reports", "by-category", params],
    queryFn: async () =>
      (await api.get<CategoryDatum[]>("/reports/by-category", { params })).data,
  });
}

export function useTrend(params: RangeParams & { granularity?: string }) {
  return useQuery({
    queryKey: ["reports", "trend", params],
    queryFn: async () => (await api.get<TrendDatum[]>("/reports/trend", { params })).data,
  });
}

export function useByAccount(params: RangeParams) {
  return useQuery({
    queryKey: ["reports", "by-account", params],
    queryFn: async () => (await api.get<AccountDatum[]>("/reports/by-account", { params })).data,
  });
}

/** Period-over-period spending insights (comparison, movers, pace). */
export function useInsights(params: { period: string; ref?: string }) {
  return useQuery({
    queryKey: ["reports", "insights", params],
    queryFn: async () => (await api.get<InsightsReport>("/reports/insights", { params })).data,
  });
}
