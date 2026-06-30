import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { Settings } from "@/lib/types";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<Settings>("/settings")).data,
    staleTime: 5 * 60_000,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["settings"] });
}

export function useUpdateSettings() {
  return useMutation({
    mutationFn: async (payload: Partial<Settings>) => (await api.put("/settings", payload)).data,
    onSuccess: invalidate,
  });
}

export function useSetPin() {
  return useMutation({
    mutationFn: async (pin: string) => (await api.post("/settings/pin", { pin })).data,
    onSuccess: invalidate,
  });
}

export function useDisablePin() {
  return useMutation({
    mutationFn: async () => (await api.delete("/settings/pin")).data,
    onSuccess: invalidate,
  });
}

export async function verifyPin(pin: string): Promise<boolean> {
  const { data } = await api.post<{ ok: boolean }>("/settings/pin/verify", { pin });
  return data.ok;
}
