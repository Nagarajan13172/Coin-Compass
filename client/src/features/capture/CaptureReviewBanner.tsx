import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Inbox, ChevronRight } from "lucide-react";
import { useIngestInbox } from "@/hooks/useIngest";

/**
 * A compact nudge shown (e.g. on the Dashboard) when captured payments are waiting
 * for review. Renders nothing when the queue is empty. Deep-links to the inbox.
 */
export function CaptureReviewBanner() {
  const { t } = useTranslation("capture");
  const { data } = useIngestInbox();
  const count = data?.count ?? 0;
  if (count === 0) return null;

  return (
    <Link
      to="/captured"
      className="mb-5 flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/[0.06] px-4 py-3 transition-colors hover:bg-primary/10"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Inbox className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{t("banner", { count })}</p>
        <p className="text-xs text-muted-foreground">{t("review")}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
