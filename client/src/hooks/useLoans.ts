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
  queryClient.invalidateQueries({ queryKey: ["networth"] });
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

/** Part payment: reduce the outstanding balance, with an optional prepayment charge %. */
export function usePayLoan() {
  return useMutation({
    mutationFn: async ({ id, amount, chargePct }: { id: string; amount: number; chargePct?: number }) =>
      (await api.post(`/loans/${id}/pay`, { amount, chargePct })).data,
    onSuccess: invalidate,
  });
}

/** Preclose (foreclose) the loan with a charge %. */
export function usePrecloseLoan() {
  return useMutation({
    mutationFn: async ({ id, chargePct }: { id: string; chargePct: number }) =>
      (await api.post(`/loans/${id}/preclose`, { chargePct })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteLoan() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/loans/${id}`)).data,
    onSuccess: invalidate,
  });
}
