import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateMoney, queryClient } from "@/lib/queryClient";
import type { Recurring } from "@/lib/types";

export function useRecurring() {
  return useQuery({
    queryKey: ["recurring"],
    queryFn: async () => (await api.get<Recurring[]>("/recurring")).data,
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

export function useRunRecurring() {
  return useMutation({
    mutationFn: async () => (await api.post("/recurring/run")).data,
    onSuccess: () => {
      invalidate();
      invalidateMoney();
    },
  });
}
