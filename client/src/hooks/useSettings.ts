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

/** Turn on (or change) the wealth lock passcode. */
export function useSetWealthPasscode() {
  return useMutation({
    mutationFn: async (passcode: string) =>
      (await api.post("/settings/wealth-passcode", { passcode })).data,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

/** Turn off the wealth lock (Net Worth becomes always visible). */
export function useDisableWealthPasscode() {
  return useMutation({
    mutationFn: async () => (await api.delete("/settings/wealth-passcode")).data,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
