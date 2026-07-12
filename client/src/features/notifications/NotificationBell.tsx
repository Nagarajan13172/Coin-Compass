import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Bell, BellOff, CheckCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useNotifications,
  useMarkAllNotificationsRead,
  useClearAllNotifications,
} from "@/hooks/useNotifications";
import { NotificationItem } from "./NotificationItem";

/** Top-bar bell with an unread badge; opens the notification center popover. */
export function NotificationBell() {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const clearAll = useClearAllNotifications();

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("bellAria")}>
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        collisionPadding={12}
        className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0"
      >
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <p className="text-sm font-semibold">{t("title")}</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={!unread || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck className="h-3.5 w-3.5" /> {t("markAllRead")}
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BellOff className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="max-h-[24rem] divide-y overflow-y-auto">
            {items.map((n) => (
              <NotificationItem key={n._id} n={n} onNavigate={() => setOpen(false)} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t px-3 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
            disabled={!items.length || clearAll.isPending}
            onClick={() => clearAll.mutate()}
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("clearAll")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}
          >
            {t("viewAll")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
