import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Holding, Transaction } from "@/lib/types";

/**
 * Holdings sit behind the wealth lock, so callers outside the Net Worth page
 * pass `{ enabled: canSeeWealth }` rather than firing a request that 403s.
 */
export function useHoldings({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["holdings"],
    enabled,
    queryFn: async () => (await api.get<Holding[]>("/holdings")).data,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["holdings"] });
  queryClient.invalidateQueries({ queryKey: ["networth"] });
  // Saving a deposit can create, change or stop its standing order, so the
  // Recurring page must not keep showing the rule as it was.
  queryClient.invalidateQueries({ queryKey: ["recurring"] });
}

/**
 * A deposit moves real money, so it touches far more than the holdings list:
 * the funding account's balance, the ledger, and every report that reads them.
 */
function invalidateLedger() {
  invalidate();
  queryClient.invalidateQueries({ queryKey: ["accounts"] });
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
  queryClient.invalidateQueries({ queryKey: ["reports"] });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useCreateHolding() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/holdings", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateHolding() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch(`/holdings/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteHolding() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/holdings/${id}`)).data,
    onSuccess: invalidateLedger,
  });
}

export interface DepositPayload {
  id: string;
  account: string;
  amount: number;
  date: string;
  note?: string;
}

/** Pay an instalment into a deposit — a transfer out of the account, not a spend. */
export function useDepositToHolding() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: DepositPayload) =>
      (await api.post(`/holdings/${id}/deposit`, payload)).data,
    onSuccess: invalidateLedger,
  });
}

/** Take money out — the principal returns as a transfer, any excess as interest income. */
export function useWithdrawFromHolding() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: DepositPayload & { close?: boolean }) =>
      (await api.post<{ principal: number; interest: number; closed: boolean }>(
        `/holdings/${id}/withdraw`,
        payload
      )).data,
    onSuccess: invalidateLedger,
  });
}

/** Past expenses that look like payments into this deposit, newest first. */
export function useDepositCandidates(id: string | null) {
  return useQuery({
    queryKey: ["holdings", id, "candidates"],
    enabled: Boolean(id),
    queryFn: async () => (await api.get<Transaction[]>(`/holdings/${id}/candidates`)).data,
  });
}

/** Rewrite those past expenses as payments into the deposit. */
export function useAdoptTransactions() {
  return useMutation({
    mutationFn: async ({ id, transactions }: { id: string; transactions: string[] }) =>
      (await api.post<{ adopted: number; total: number }>(`/holdings/${id}/adopt`, { transactions })).data,
    onSuccess: invalidateLedger,
  });
}
