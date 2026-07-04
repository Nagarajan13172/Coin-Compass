import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Inbox, Zap, Check, X, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import { relativeTime } from "@/features/notifications/notificationMeta";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useIngestInbox, useCommitCapture, useDismissCapture } from "@/hooks/useIngest";
import type { IngestedPayment, RefLite, TxnType } from "@/lib/types";

/** Pull an id out of a populated ref or a raw id string. */
function refId(v: RefLite | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "object" ? v._id : v;
}

/** One pending capture: shows the parsed amount + merchant, lets the user fix the
 *  type / account / category, then confirm (create the transaction) or dismiss. */
function PendingCaptureCard({ item }: { item: IngestedPayment }) {
  const { t } = useTranslation("capture");
  const { data: accounts = [] } = useAccounts();
  const [type, setType] = useState<TxnType>(item.parsed.direction ?? "expense");
  const { data: categories = [] } = useCategories(type === "income" ? "income" : "expense");
  const [accountId, setAccountId] = useState(refId(item.account));
  const [categoryId, setCategoryId] = useState(refId(item.category));
  const commit = useCommitCapture();
  const dismiss = useDismissCapture();
  const busy = commit.isPending || dismiss.isPending;

  function setTypeAndClearCategory(next: TxnType) {
    setType(next);
    setCategoryId(""); // categories are type-scoped; the old pick may not apply
  }

  function onAdd() {
    commit.mutate({
      id: item._id,
      edits: {
        type,
        account: accountId || undefined,
        category: categoryId || null,
      },
    });
  }

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("text-lg font-semibold tabular-nums", type === "income" ? "text-income" : "text-expense")}>
            {type === "income" ? "+" : "−"}
            {formatMoney(item.parsed.amount ?? 0)}
          </p>
          {item.parsed.merchant && (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {t("capturedFrom", { merchant: item.parsed.merchant })}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground/70">{relativeTime(item.createdAt)}</p>
        </div>
        {/* Expense / Income segmented toggle */}
        <div className="flex shrink-0 overflow-hidden rounded-lg border text-sm">
          {(["expense", "income"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setTypeAndClearCategory(opt)}
              className={cn(
                "px-3 py-1.5 transition-colors",
                type === opt ? "bg-primary text-primary-foreground" : "hover:bg-accent"
              )}
            >
              {t(opt)}
            </button>
          ))}
        </div>
      </div>

      {item.rawText && (
        <p className="mt-3 line-clamp-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
          {item.rawText}
        </p>
      )}

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger aria-label={t("account")}>
            <SelectValue placeholder={t("account")} />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger aria-label={t("category")}>
            <SelectValue placeholder={t("category")} />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c._id} value={c._id}>
                {categoryLabel(c.name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => dismiss.mutate(item._id)}>
          <X className="h-4 w-4" /> {t("dismiss")}
        </Button>
        <Button size="sm" disabled={busy || !accountId} onClick={onAdd}>
          <Check className="h-4 w-4" /> {t("add")}
        </Button>
      </div>
    </div>
  );
}

/** A recently auto-committed capture — read-only, with a link to its transaction. */
function RecentCaptureRow({ item }: { item: IngestedPayment }) {
  const { t } = useTranslation("capture");
  const direction = item.parsed.direction ?? "expense";
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-income/10 text-income">
        <Zap className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {item.parsed.merchant || t("autoAdded")}
        </p>
        <p className="text-xs text-muted-foreground/70">{relativeTime(item.createdAt)}</p>
      </div>
      <span className={cn("shrink-0 text-sm font-semibold tabular-nums", direction === "income" ? "text-income" : "text-expense")}>
        {direction === "income" ? "+" : "−"}
        {formatMoney(item.parsed.amount ?? 0)}
      </span>
      <Badge variant="secondary" className="shrink-0">
        {t("autoAdded")}
      </Badge>
    </div>
  );
}

/** The auto-capture review inbox: payments that need a tap, plus recent auto-adds. */
export default function CapturedPage() {
  const { t } = useTranslation("capture");
  const { data, isLoading } = useIngestInbox();
  const pending = data?.pending ?? [];
  const recent = data?.recent ?? [];

  return (
    <div>
      <PageHeader title={t("title")} description={t("pageDescription")} />

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-xl" />
          ))}
        </div>
      ) : pending.length === 0 && recent.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={t("empty")}
          description={t("emptyDescription")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/settings">
                {t("settings.title")} <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-8">
          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {t("pendingHeading")} · {pending.length}
              </h2>
              {pending.map((item) => (
                <PendingCaptureCard key={item._id} item={item} />
              ))}
            </section>
          )}

          {recent.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground">{t("recentHeading")}</h2>
              <div className="divide-y overflow-hidden rounded-xl border">
                {recent.map((item) => (
                  <RecentCaptureRow key={item._id} item={item} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
