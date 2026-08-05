import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient, invalidateMoney } from "@/lib/queryClient";
import type { Split } from "@/lib/types";

export function useSplits() {
  return useQuery({
    queryKey: ["splits"],
    queryFn: async () => (await api.get<Split[]>("/splits")).data,
  });
}

// A split posts an expense plus one credit (and transfer) per participant, so every
// mutation invalidates the credits list as well as everything a transaction affects.
function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["splits"] });
  queryClient.invalidateQueries({ queryKey: ["credits"] });
  invalidateMoney();
}

export function useCreateSplit() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post<Split>("/splits", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateSplit() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch<Split>(`/splits/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteSplit() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/splits/${id}`)).data,
    onSuccess: invalidate,
  });
}
