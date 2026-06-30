import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateMoney } from "@/lib/queryClient";
import type { Transaction, TransactionPage } from "@/lib/types";

export interface TxnFilters {
  account?: string;
  category?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
  tag?: string;
}

export function useTransactions(filters: TxnFilters = {}, limit = 30) {
  return useInfiniteQuery({
    queryKey: ["transactions", filters, limit],
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get<TransactionPage>("/transactions", {
        params: { ...cleanFilters(filters), page: pageParam, limit },
      });
      return data;
    },
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
  });
}

/** Flat list for a fixed query (e.g. a single day or account). */
export function useTransactionList(filters: TxnFilters = {}, limit = 200) {
  return useQuery({
    queryKey: ["transactions", "list", filters, limit],
    queryFn: async () => {
      const { data } = await api.get<TransactionPage>("/transactions", {
        params: { ...cleanFilters(filters), limit },
      });
      return data.items;
    },
  });
}

function cleanFilters(f: TxnFilters) {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== ""));
}

export function useCreateTransaction() {
  return useMutation({
    mutationFn: async (payload: Partial<Transaction>) =>
      (await api.post("/transactions", payload)).data,
    onSuccess: () => invalidateMoney(),
  });
}

export function useUpdateTransaction() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Transaction> & { id: string }) =>
      (await api.patch(`/transactions/${id}`, payload)).data,
    onSuccess: () => invalidateMoney(),
  });
}

export function useDeleteTransaction() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/transactions/${id}`)).data,
    onSuccess: () => invalidateMoney(),
  });
}
