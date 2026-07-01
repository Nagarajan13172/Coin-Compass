import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Loan } from "@/lib/types";

export function useLoans() {
  return useQuery({
    queryKey: ["loans"],
    queryFn: async () => (await api.get<Loan[]>("/loans")).data,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["loans"] });
}

export function useCreateLoan() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post("/loans", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateLoan() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch(`/loans/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteLoan() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/loans/${id}`)).data,
    onSuccess: invalidate,
  });
}
