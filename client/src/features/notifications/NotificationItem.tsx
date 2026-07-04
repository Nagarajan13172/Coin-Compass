import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMarkNotificationRead, useClearNotification } from "@/hooks/useNotifications";
import type { AppNotification } from "@/lib/types";
import {
  NOTIFICATION_META,
  notificationToneClass,
  notificationText,
  relativeTime,
} from "./notificationMeta";

interface NotificationItemProps {
  n: AppNotification;
  /** Called after navigating away (e.g. to close the popover). */
  onNavigate?: () => void;
}

/** One notification row: icon, localized title/body, relative time, unread dot,
 *  and a dismiss button. Clicking marks it read and follows its deep link. */
export function NotificationItem({ n, onNavigate }: NotificationItemProps) {
  const { t } = useTranslation("notifications");
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const clear = useClearNotification();

  const { title, body } = notificationText(t, n);
  const Icon = NOTIFICATION_META[n.type]?.icon ?? Bell;

  function open() {
    if (!n.read) markRead.mutate(n._id);
    if (n.link) {
      navigate(n.link);
      onNavigate?.();
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "group relative flex cursor-pointer gap-3 px-3 py-3 text-left transition-colors hover:bg-accent",
        !n.read && "bg-primary/[0.04]"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          notificationToneClass(n.type)
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{title}</p>
          {!n.read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
          )}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
        <p className="mt-1 text-xs text-muted-foreground/70">{relativeTime(n.createdAt)}</p>
      </div>
      <button
        type="button"
        aria-label={t("clearOne")}
        onClick={(e) => {
          e.stopPropagation();
          clear.mutate(n._id);
        }}
        className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
