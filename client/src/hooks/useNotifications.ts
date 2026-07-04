import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import type { NotificationList } from "@/lib/types";

/** The in-app notification center. Polls so cron/sweep-generated items surface
 *  without a reload, and refetches when the window regains focus. */
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<NotificationList>("/notifications")).data,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}

function invalidate() {
  queryClient.invalidateQueries({ queryKey: ["notifications"] });
}

export function useMarkNotificationRead() {
  return useMutation({
    mutationFn: async (id: string) => (await api.post(`/notifications/${id}/read`)).data,
    onSuccess: invalidate,
  });
}

export function useMarkAllNotificationsRead() {
  return useMutation({
    mutationFn: async () => (await api.post("/notifications/read-all")).data,
    onSuccess: invalidate,
  });
}

export function useClearNotification() {
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/notifications/${id}`)).data,
    onSuccess: invalidate,
  });
}

export function useClearAllNotifications() {
  return useMutation({
    mutationFn: async () => (await api.delete("/notifications")).data,
    onSuccess: invalidate,
  });
}
