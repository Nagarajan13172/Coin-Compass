import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Holding } from "@/lib/types";

export function useHoldings() {
  return useQuery({
    queryKey: ["holdings"],
    queryFn: async () => (await api.get<Holding[]>("/holdings")).data,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["holdings"] });
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
    onSuccess: invalidate,
  });
}
