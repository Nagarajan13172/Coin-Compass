import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient, invalidateMoney } from "@/lib/queryClient";
import type { Person } from "@/lib/types";

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: async () => (await api.get<Person[]>("/people")).data,
  });
}

// Renaming or merging a person re-labels and re-groups existing ledgers, so every
// view built on credits/splits has to be refetched — not just the people list.
function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["people"] });
  queryClient.invalidateQueries({ queryKey: ["credits"] });
  queryClient.invalidateQueries({ queryKey: ["splits"] });
  invalidateMoney();
}

export function useCreatePerson() {
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => (await api.post<Person>("/people", payload)).data,
    onSuccess: invalidate,
  });
}

export function useUpdatePerson() {
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string } & Record<string, unknown>) =>
      (await api.patch<Person>(`/people/${id}`, payload)).data,
    onSuccess: invalidate,
  });
}

export function useDeletePerson() {
  return useMutation({
    // `force` is the second step of the shared delete flow: the first attempt
    // 409s with PERSON_IN_USE while the person still has entries.
    mutationFn: async ({ id, force }: { id: string; force?: boolean }) =>
      (await api.delete(`/people/${id}${force ? "?force=true" : ""}`)).data,
    onSuccess: invalidate,
  });
}

export function useMergePeople() {
  return useMutation({
    mutationFn: async ({ id, into }: { id: string; into: string }) =>
      (await api.post(`/people/${id}/merge`, { into })).data,
    onSuccess: invalidate,
  });
}
