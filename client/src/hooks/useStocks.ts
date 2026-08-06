import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { InstrumentHit, Portfolio, StockSale } from "@/lib/types";

export function usePortfolio() {
  return useQuery({
    queryKey: ["stocks", "portfolio"],
    queryFn: async () => (await api.get<Portfolio>("/stocks/portfolio")).data,
  });
}

export function useStockSales() {
  return useQuery({
    queryKey: ["stocks", "sales"],
    queryFn: async () => (await api.get<StockSale[]>("/stocks/sales")).data,
  });
}

/**
 * Symbol autocomplete. Disabled below two characters — the server returns nothing
 * for a shorter query, so asking would only burn a round trip per keystroke.
 * Results are cached per query, which makes backspacing through a search free.
 */
export function useInstrumentSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ["stocks", "search", q],
    queryFn: async () => (await api.get<InstrumentHit[]>("/stocks/search", { params: { q } })).data,
    enabled: q.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Buying and selling move real money, so they invalidate the ledger too —
 * accounts, transactions and net worth all change, not just the portfolio.
 */
function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["stocks"] });
  queryClient.invalidateQueries({ queryKey: ["accounts"] });
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
  queryClient.invalidateQueries({ queryKey: ["networth"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
}

export function useBuyStock() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/stocks/buy", payload)).data,
    onSuccess: invalidate,
  });
}

export function useSellStock() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/stocks/sell", payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteLot() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/stocks/lots/${id}`)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteSale() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/stocks/sales/${id}`)).data,
    onSuccess: invalidate,
  });
}

/** User-triggered price refresh. Rate-limited server-side (429 with a wait hint). */
export function useRefreshPrices() {
  return useMutation({
    mutationFn: async () => (await api.post<Portfolio>("/stocks/refresh")).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["stocks", "portfolio"], data);
      queryClient.invalidateQueries({ queryKey: ["networth"] });
    },
  });
}
