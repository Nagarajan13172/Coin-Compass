import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient, invalidateMoney } from "@/lib/queryClient";
import type { Credit, CreditPersonSummary } from "@/lib/types";

export function useCredits() {
  return useQuery({
    queryKey: ["credits"],
    queryFn: async () => (await api.get<Credit[]>("/credits")).data,
  });
}

/** Entries grouped by person with running net totals. */
export function useCreditSummary() {
  return useQuery({
    queryKey: ["credits", "summary"],
    queryFn: async () => (await api.get<CreditPersonSummary[]>("/credits/summary")).data,
  });
}

// A credit can create/update/delete a real transaction (see `reflected`), so
// every mutation also invalidates everything a transaction change can affect.
function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["credits"] });
  invalidateMoney();
}

export function useCreateCredit() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post<Credit>("/credits", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateCredit() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch<Credit>(`/credits/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteCredit() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/credits/${id}`)).data,
    onSuccess: invalidate,
  });
}
