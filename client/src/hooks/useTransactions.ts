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

export interface TagCount {
  tag: string;
  count: number;
}

/** Distinct tags the user has used, most-used first. Keyed under "transactions" so a
 *  transaction mutation (which calls invalidateMoney) refreshes it automatically. */
export function useTags() {
  return useQuery({
    queryKey: ["transactions", "tags"],
    queryFn: async () => (await api.get<TagCount[]>("/transactions/tags")).data,
  });
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

/**
 * Grand-total balance across all accounts as of an instant (`asOf`, exclusive),
 * or right now when omitted. Anchors the Transactions page's per-day end-of-day
 * balance so it's correct even when viewing a past month. Keyed under
 * "transactions" so a mutation (invalidateMoney) refreshes it automatically.
 */
export function useLedgerBalance(asOf?: string, enabled = true) {
  return useQuery({
    queryKey: ["transactions", "balance", asOf ?? null],
    enabled,
    queryFn: async () =>
      (await api.get<{ balance: number }>("/transactions/balance", {
        params: asOf ? { asOf } : {},
      })).data.balance,
  });
}

/** The user's soft-deleted transactions (the "Recently deleted" trash), newest first. */
export function useDeletedTransactions() {
  return useQuery({
    queryKey: ["transactions", "deleted"],
    queryFn: async () => (await api.get<Transaction[]>("/transactions/deleted")).data,
  });
}

export function useRestoreTransaction() {
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<Transaction>(`/transactions/${id}/restore`)).data,
    onSuccess: () => invalidateMoney(),
  });
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

/** `recoverable` is true when the delete was a soft delete (restorable from the trash);
 *  false for loan/credit-linked transactions, which are removed permanently. */
export interface DeleteResult {
  ok: boolean;
  recoverable: boolean;
  id?: string;
}

export function useDeleteTransaction() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete<DeleteResult>(`/transactions/${id}`)).data,
    onSuccess: () => invalidateMoney(),
  });
}
