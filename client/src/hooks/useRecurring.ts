import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateMoney, queryClient } from "@/lib/queryClient";
import type { Recurring, Transaction } from "@/lib/types";

export function useRecurring() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: async () => (await api.get<Recurring[]>("/recurring")).data,
  });
}

/** Transactions a rule has already posted (its history). */
export function useRecurringTransactions(id: string | null) {
  return useQuery({
    queryKey: ["recurring", id, "transactions"],
    enabled: Boolean(id),
    queryFn: async () =>
      (await api.get<Transaction[]>(`/recurring/${id}/transactions`)).data,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["recurring"] });
}

export function useCreateRecurring() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post("/recurring", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateRecurring() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch(`/recurring/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteRecurring() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/recurring/${id}`)).data,
    onSuccess: invalidate,
  });
}

/** Process all due rules right now. */
export function useRunRecurring() {
  return useMutation({
    mutationFn: async () => (await api.post<{ created: number }>("/recurring/run")).data,
    onSuccess: () => {
      invalidate();
      invalidateMoney();
    },
  });
}

/** Post the due occurrences for a single rule. */
export function useRunRecurringOne() {
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ created: number }>(`/recurring/${id}/run`)).data,
    onSuccess: () => {
      invalidate();
      invalidateMoney();
    },
  });
}

/** Skip a rule's next occurrence without posting a transaction. */
export function useSkipRecurring() {
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/recurring/${id}/skip`)).data,
    onSuccess: invalidate,
  });
}
