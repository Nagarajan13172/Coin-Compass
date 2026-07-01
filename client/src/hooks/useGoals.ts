import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Goal } from "@/lib/types";

export function useGoals() {
  return useQuery({
    queryKey: ["goals"],
    queryFn: async () => (await api.get<Goal[]>("/goals")).data,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["goals"] });
}

export function useCreateGoal() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/goals", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateGoal() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch(`/goals/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

/** Add (positive) or withdraw (negative) an amount from a goal's saved total. */
export function useContributeGoal() {
  return useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) =>
      (await api.post(`/goals/${id}/contribute`, { amount })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteGoal() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/goals/${id}`)).data,
    onSuccess: invalidate,
  });
}
