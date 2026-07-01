import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NetWorthSnapshot } from "@/lib/types";

/**
 * Daily net-worth snapshots (oldest → newest). The server records today's point
 * on each read, so the trend accumulates one point per day the user visits.
 */
export function useNetWorthHistory(days = 365) {
  return useQuery({
    queryKey: ["networth", "history", days],
    queryFn: async () =>
      (await api.get<NetWorthSnapshot[]>("/networth/history", { params: { days } })).data,
  });
}
