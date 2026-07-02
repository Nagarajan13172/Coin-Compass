import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
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

/**
 * On-demand refresh (rate-limited server-side — see metalPriceService). On
 * success, re-pulls both the latest card and every history series so today's
 * point in the graph reflects the fresh rate immediately, alongside the
 * regular once-daily automatic refresh.
 */
export function useRefreshMetals() {
  return useMutation({
    mutationFn: async () => (await api.post<MetalsLatest>("/metals/refresh")).data,
    onSuccess: (data) => {
      queryClient.setQueryData(["metals", "latest"], data);
      queryClient.invalidateQueries({ queryKey: ["metals", "history"] });
    },
  });
}
