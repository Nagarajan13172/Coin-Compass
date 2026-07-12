import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Template, TemplateInput } from "@/lib/types";

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: async () => (await api.get<Template[]>("/templates")).data,
    staleTime: 5 * 60_000,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["templates"] });
}

export function useCreateTemplate() {
  return useMutation({
    mutationFn: async (payload: Partial<TemplateInput>) => (await api.post("/templates", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateTemplate() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: Partial<TemplateInput> & { id: string }) =>
      (await api.patch(`/templates/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteTemplate() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/templates/${id}`)).data,
    onSuccess: invalidate,
  });
}
