import { useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { categoryLabel } from "@/lib/i18nLabels";
import type { Category, CategoryType } from "@/lib/types";

export function useCategories(type?: CategoryType) {
  // Order by the *displayed* (localized) label so the list reads A–Z in the
  // active language — re-sorts when the language changes (Tamil ≠ English order).
  const { i18n } = useTranslation();
  const sortByLabel = useCallback(
    (data: Category[]) =>
      [...data].sort((a, b) =>
        categoryLabel(a.name).localeCompare(categoryLabel(b.name), i18n.language, {
          sensitivity: "base",
        })
      ),
    [i18n.language]
  );

  return useQuery({
    queryKey: ["categories", { type: type ?? "all" }],
    queryFn: async () => {
      const { data } = await api.get<Category[]>("/categories", {
        params: type ? { type } : {},
      });
      return data;
    },
    select: sortByLabel,
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
