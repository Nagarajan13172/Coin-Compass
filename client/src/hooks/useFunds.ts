import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { FundHit, FundPortfolio, FundRedemptionRow } from "@/lib/types";

export function useFundPortfolio() {
  return useQuery({
    queryKey: ["funds", "portfolio"],
    queryFn: async () => (await api.get<FundPortfolio>("/funds/portfolio")).data,
  });
}

export function useFundRedemptions() {
  return useQuery({
    queryKey: ["funds", "redemptions"],
    queryFn: async () => (await api.get<FundRedemptionRow[]>("/funds/redemptions")).data,
  });
}

/**
 * Scheme autocomplete over the cached AMFI universe. Disabled below two
 * characters — the server answers nothing shorter — and cached per query, so
 * backspacing through a search costs nothing.
 */
export function useFundSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["funds", "search", q],
    queryFn: async () => (await api.get<FundHit[]>("/funds/search", { params: { q } })).data,
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Buying and redeeming move real money, so they invalidate the ledger too —
 * accounts, transactions and net worth all change, not just the portfolio.
 */
function invalidate() {
  for (const key of ["funds", "accounts", "transactions", "networth", "dashboard", "reports"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}

export function useBuyFund() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/funds/buy", payload)).data,
    onSuccess: invalidate,
  });
}

export function useRedeemFund() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/funds/redeem", payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteFundLot() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/funds/lots/${id}`)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteFundRedemption() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/funds/redemptions/${id}`)).data,
    onSuccess: invalidate,
  });
}

/** Pull today's NAV file on demand — the Funds page's refresh button. */
export function useRefreshNavs() {
  return useMutation({
    mutationFn: async () => (await api.post("/funds/refresh")).data,
    onSuccess: invalidate,
  });
}
