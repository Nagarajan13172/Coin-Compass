import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Category, CategoryType } from "@/lib/types";

export function useCategories(type?: CategoryType) {
  return useQuery({
    queryKey: ["categories", { type: type ?? "all" }],
    queryFn: async () => {
      const { data } = await api.get<Category[]>("/categories", {
        params: type ? { type } : {},
      });
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["categories"] });
}

export function useCreateCategory() {
  return useMutation({
    mutationFn: async (payload: Partial<Category>) => (await api.post("/categories", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<Category> & { id: string }) =>
      (await api.patch(`/categories/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteCategory() {
  return useMutation({
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await api.delete(`/categories/${id}`, { params: force ? { force: true } : {} })).data,
    onSuccess: invalidate,
  });
}
