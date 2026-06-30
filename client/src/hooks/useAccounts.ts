import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { invalidateMoney, queryClient } from "@/lib/queryClient";
import type { Account } from "@/lib/types";

export function useAccounts(includeArchived = false) {
  return useQuery({
    queryKey: ["accounts", { includeArchived }],
    queryFn: async () => {
      const { data } = await api.get<Account[]>("/accounts", {
        params: includeArchived ? { includeArchived: true } : {},
      });
      return data;
    },
  });
}

export function useCreateAccount() {
  return useMutation({
    mutationFn: async (payload: Partial<Account>) => (await api.post("/accounts", payload)).data,
    onSuccess: () => invalidateMoney(),
  });
}

export function useUpdateAccount() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Account> & { id: string }) =>
      (await api.patch(`/accounts/${id}`, payload)).data,
    onSuccess: () => invalidateMoney(),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await api.delete(`/accounts/${id}`, { params: force ? { force: true } : {} })).data,
    onSuccess: () => {
      invalidateMoney();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
  });
}
