import { useTranslation } from "react-i18next";
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useClearAllNotifications,
} from "@/hooks/useNotifications";
import { NotificationItem } from "@/features/notifications/NotificationItem";

/** Full-page notification center — the complete list plus bulk actions. */
export default function NotificationsPage() {
  const { t } = useTranslation("notifications");
  const { data, isLoading } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const clearAll = useClearAllNotifications();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <div>
      <PageHeader
        title={t("title")}
        description={t("pageDescription")}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={!unread || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck className="h-4 w-4" /> {t("markAllRead")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!items.length || clearAll.isPending}
              onClick={() => clearAll.mutate()}
            >
              <Trash2 className="h-4 w-4" /> {t("clearAll")}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={BellOff} title={t("empty")} description={t("emptyDescription")} />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border">
          {items.map((n) => (
            <NotificationItem key={n._id} n={n} />
          ))}
        </div>
      )}
    </div>
  );
}
