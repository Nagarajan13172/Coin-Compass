import { useMemo, useState } from "react";
import { format } from "date-fns";
import { motion } from "motion/react";
import {
  History,
  MoreVertical,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  RefreshCw,
  SkipForward,
  Trash2,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import {
  useDeleteRecurring,
  useRecurring,
  useRunRecurringOne,
  useSkipRecurring,
  useUpdateRecurring,
} from "@/hooks/useRecurring";
import { RecurringFormDialog } from "@/features/recurring/RecurringFormDialog";
import { RecurringOccurrencesDialog } from "@/features/recurring/RecurringOccurrencesDialog";
import { RunDueDialog } from "@/features/recurring/RunDueDialog";
import { isDue, isEnded, monthlyAmount } from "@/lib/recurring";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import { dateFnsLocale } from "@/lib/dates";
import type { Recurring } from "@/lib/types";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";

function freqLabel(r: Recurring, t: TFunction) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.frequency];
  return t(`every.${unit}`, { count: r.interval });
}

/** Human label for a rule — its category (translated), or the note/transfer fallback. */
function ruleName(r: Recurring, t: TFunction) {
  if (r.type === "transfer") return t("txnType.transfer", { ns: "common" });
  return r.category?.name ? categoryLabel(r.category.name) : r.note || t("title.fallback");
}

/** Normalized per-month cash-flow across all active rules, for the overview strip. */
function MonthlySummary({ items }: { items: Recurring[] }) {
  const { t } = useTranslation("recurring");
  const { income, expense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const r of items) {
      if (!r.active) continue;
      if (r.type === "income") income += monthlyAmount(r);
      else if (r.type === "expense") expense += monthlyAmount(r);
    }
    return { income, expense };
  }, [items]);

  if (income === 0 && expense === 0) return null;
  const net = income - expense;

  return (
    <Card className="mb-4">
      <CardContent className="grid grid-cols-3 divide-x p-0 text-center">
        <div className="p-3">
          <p className="text-xs text-muted-foreground">{t("summary.income")}</p>
          <p className="mt-0.5 font-semibold tnum text-income">+{formatMoney(income)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground">{t("summary.expenses")}</p>
          <p className="mt-0.5 font-semibold tnum text-expense">−{formatMoney(expense)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground">{t("summary.net")}</p>
          <p
            className={`mt-0.5 font-semibold tnum ${
              net > 0 ? "text-income" : net < 0 ? "text-expense" : "text-muted-foreground"
            }`}
          >
            {formatMoney(net, { signed: true })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RecurringPage() {
  const { t } = useTranslation("recurring");
  const { data: items, isLoading } = useRecurring();
  const del = useDeleteRecurring();
  const update = useUpdateRecurring();
  const runOne = useRunRecurringOne();
  const skip = useSkipRecurring();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [historyFor, setHistoryFor] = useState<Recurring | null>(null);
  const [runDueOpen, setRunDueOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Recurring | null>(null);

  async function confirmDelete(r: Recurring) {
    try {
      await del.mutateAsync(r._id);
      toast.success(t("toast.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.deleteFailed"));
      throw e; // keep the confirm dialog open on failure
    }
  }

  const dueCount = useMemo(() => (items ?? []).filter((r) => isDue(r)).length, [items]);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(r: Recurring) {
    setEditing(r);
    setDialogOpen(true);
  }

  async function runOneNow(r: Recurring) {
    const res = await runOne.mutateAsync(r._id);
    toast.success(
      res.created ? t("toast.posted", { count: res.created }) : t("toast.nothingDueRule")
    );
  }

  async function skipNext(r: Recurring) {
    await skip.mutateAsync(r._id);
    toast.success(t("toast.skipped"));
  }

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRunDueOpen(true)} disabled={!items?.length}>
              <RefreshCw /> {t("page.runDue")}
              {dueCount > 0 && (
                <Badge variant="warning" className="ml-1 px-1.5">
                  {dueCount}
                </Badge>
              )}
            </Button>
            <Button onClick={openNew}>
              <Plus /> {t("page.newRule")}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <>
          <MonthlySummary items={items} />
          <div className="space-y-3">
            {items.map((r, i) => {
              const overdue = isDue(r) && new Date(r.nextRun) < new Date();
              const ended = isEnded(r);
              // Surface the note so same-category rules stay distinguishable — but not
              // when it's already the title (no category) or just echoes the category.
              const note = r.note?.trim();
              const titleIsNote = r.type !== "transfer" && !r.category?.name;
              const noteEchoesCategory =
                note && r.category?.name && note.toLowerCase() === r.category.name.toLowerCase();
              const detailNote = note && !titleIsNote && !noteEchoesCategory ? note : "";
              return (
              <motion.div
                key={r._id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
              >
                <Card className={r.active ? undefined : "opacity-70"}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <CategoryIcon
                      icon={r.type === "transfer" ? "repeat" : r.category?.icon}
                      color={r.type === "transfer" ? "#3B82F6" : r.category?.color}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{ruleName(r, t)}</p>
                        {overdue && <Badge variant="warning">{t("badges.overdue")}</Badge>}
                        {ended && <Badge variant="secondary">{t("badges.ended")}</Badge>}
                        {!r.active && !ended && <Badge variant="secondary">{t("badges.paused")}</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {freqLabel(r, t)} · {r.account?.name}
                        {detailNote ? ` · ${detailNote}` : ""}
                      </p>
                      <p className={`mt-0.5 truncate text-xs ${overdue ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>
                        {ended
                          ? t("status.ended", { date: format(new Date(r.endDate as string), "dd MMM yyyy", { locale: dateFnsLocale() }) })
                          : !r.active
                            ? t("status.paused")
                            : overdue
                              ? t("status.overdueSince", { date: format(new Date(r.nextRun), "dd MMM yyyy", { locale: dateFnsLocale() }) })
                              : t("status.next", { date: format(new Date(r.nextRun), "dd MMM yyyy", { locale: dateFnsLocale() }) })}
                        {r.active && !overdue && r.endDate
                          ? t("status.endsSuffix", { date: format(new Date(r.endDate), "dd MMM yyyy", { locale: dateFnsLocale() }) })
                          : ""}
                        {r.lastRun ? t("status.lastPostedSuffix", { date: format(new Date(r.lastRun), "dd MMM", { locale: dateFnsLocale() }) }) : ""}
                      </p>
                    </div>
                    <Money amount={r.amount} type={r.type} signed className="text-sm" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t("page.actionsAria")}>
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}>
                          <Pencil /> {t("actions.edit", { ns: "common" })}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => runOneNow(r)} disabled={runOne.isPending}>
                          <Zap /> {t("menu.runNow")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => skipNext(r)} disabled={skip.isPending}>
                          <SkipForward /> {t("menu.skipNext")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => update.mutate({ id: r._id, active: !r.active })}
                        >
                          {r.active ? <Pause /> : <Play />} {r.active ? t("menu.pause") : t("menu.resume")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setHistoryFor(r)}>
                          <History /> {t("menu.viewPosted")}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 /> {t("actions.delete", { ns: "common" })}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              </motion.div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Repeat}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button onClick={openNew}>
              <Plus /> {t("empty.action")}
            </Button>
          }
        />
      )}

      <RunDueDialog open={runDueOpen} onOpenChange={setRunDueOpen} rules={items} />
      <RecurringFormDialog open={dialogOpen} onOpenChange={setDialogOpen} recurring={editing} />
      <RecurringOccurrencesDialog
        open={Boolean(historyFor)}
        onOpenChange={(o) => !o && setHistoryFor(null)}
        recurring={historyFor}
      />
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="recurring"
          confirmValue={String(deleteTarget.amount)}
          onConfirm={() => confirmDelete(deleteTarget)}
        />
      )}
    </div>
  );
}
