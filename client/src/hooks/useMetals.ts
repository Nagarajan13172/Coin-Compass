import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Metal, MetalPrice, MetalsLatest } from "@/lib/types";

// Rates change once a day, so keep them fresh for 30 min to avoid refetching.
const THIRTY_MIN = 1000 * 60 * 30;

export function useMetalsLatest() {
  return useQuery({
    queryKey: ["metals", "latest"],
    queryFn: async () => (await api.get<MetalsLatest>("/metals/latest")).data,
    staleTime: THIRTY_MIN,
  });
}

export function useMetalHistory(metal: Metal, days = 90, enabled = true) {
  return useQuery({
    queryKey: ["metals", "history", metal, days],
    queryFn: async () =>
      (await api.get<MetalPrice[]>(`/metals/history?metal=${metal}&days=${days}`)).data,
    staleTime: THIRTY_MIN,
    enabled,
  });
}
