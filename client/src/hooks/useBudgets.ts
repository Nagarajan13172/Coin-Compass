import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Budget } from "@/lib/types";

export function useBudgets() {
  return useQuery({
    queryKey: ["budgets"],
    queryFn: async () => (await api.get<Budget[]>("/budgets")).data,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["budgets"] });
}

export function useCreateBudget() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post("/budgets", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateBudget() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch(`/budgets/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/budgets/${id}`)).data,
    onSuccess: invalidate,
  });
}
