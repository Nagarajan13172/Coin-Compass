import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { PersonGroup } from "@/lib/types";

export function usePersonGroups() {
  return useQuery({
    queryKey: ["people", "groups"],
    queryFn: async () => (await api.get<PersonGroup[]>("/people/groups")).data,
  });
}

// A group can find-or-create people as members, so the people list is refetched
// too. No balance can change, so nothing beyond these two caches is touched.
function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["people"] });
}

export function useCreatePersonGroup() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) =>
      (await api.post<PersonGroup>("/people/groups", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdatePersonGroup() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch<PersonGroup>(`/people/groups/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeletePersonGroup() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/people/groups/${id}`)).data,
    onSuccess: invalidate,
  });
}
