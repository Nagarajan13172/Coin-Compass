import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { addMonths, differenceInCalendarMonths, format } from "date-fns";
import {
  CheckCircle2,
  Info,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/common/AmountInput";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { fmtDate, dateFnsLocale } from "@/lib/dates";
import { useGoals, useDeleteGoal, useContributeGoal } from "@/hooks/useGoals";
import { GoalFormDialog } from "@/features/goals/GoalFormDialog";
import type { Goal } from "@/lib/types";
import { toast } from "sonner";

type ContributeState = { goal: Goal; mode: "add" | "withdraw" };

export default function GoalsPage() {
  const { t } = useTranslation("planning");
  const { data: goals, isLoading } = useGoals();
  const del = useDeleteGoal();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contributing, setContributing] = useState<ContributeState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null);

  const totalSaved = goals?.reduce((s, g) => s + g.savedAmount, 0) ?? 0;
  const totalTarget = goals?.reduce((s, g) => s + g.targetAmount, 0) ?? 0;
  const overallPct = totalTarget > 0 ? Math.min(Math.round((totalSaved / totalTarget) * 100), 100) : 0;

  const active = goals?.filter((g) => !g.complete) ?? [];
  const completed = goals?.filter((g) => g.complete) ?? [];

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(g: Goal) {
    setEditing(g);
    setFormOpen(true);
  }
  async function confirmDelete(g: Goal) {
    try {
      await del.mutateAsync(g._id);
      toast.success(t("goals.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contribute.failed"));
      throw e; // keep the dialog open on failure
    }
  }

  function renderCard(g: Goal, i: number) {
    return (
      <motion.div
        key={g._id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
      >
        <GoalCard
          goal={g}
          onEdit={() => openEdit(g)}
          onDelete={() => setDeleteTarget(g)}
          onContribute={(mode) => setContributing({ goal: g, mode })}
        />
      </motion.div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t("goals.title")}
        description={t("goals.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("goals.newGoal")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : goals && goals.length > 0 ? (
        <div className="space-y-6">
          {/* summary */}
          <Card className="surface-gradient">
            <CardContent className="space-y-3 p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t("goals.totalSaved")}</p>
                  <p className="tnum text-3xl font-extrabold">{formatMoney(totalSaved)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("goals.allTime")} · {t("goals.activeCount", { count: active.length })}
                    {completed.length > 0 && ` · ${t("goals.completedCount", { count: completed.length })}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm text-muted-foreground">
                    {t("goals.ofAmount", { amount: formatMoney(totalTarget) })}
                  </p>
                  <p className="tnum text-lg font-semibold">{overallPct}%</p>
                </div>
              </div>
              <Progress value={overallPct} />
            </CardContent>
          </Card>

          {/* active */}
          {active.length > 0 && (
            <section className="space-y-3">
              {completed.length > 0 && <SectionHeading title={t("goals.activeGoals")} count={active.length} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map(renderCard)}
              </div>
            </section>
          )}

          {/* completed */}
          {completed.length > 0 && (
            <section className="space-y-3">
              <SectionHeading title={t("goals.completed")} count={completed.length} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map(renderCard)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title={t("goals.emptyTitle")}
          description={t("goals.emptyDescription")}
          action={
            <Button onClick={openNew}>
              <Plus /> {t("goals.newGoal")}
            </Button>
          }
        />
      )}

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} />
      <ContributeDialog state={contributing} onClose={() => setContributing(null)} />
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="goal"
          confirmValue={deleteTarget.name}
          onConfirm={() => confirmDelete(deleteTarget)}
        />
      )}
    </div>
  );
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      <span className="tnum rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        {count}
      </span>
    </div>
  );
}

/** On-track / ahead / behind vs the target date, from the planned ETA. Label is built by the caller. */
function schedule(g: Goal): { kind: "ahead" | "onTrack" | "behind"; months: number; tone: "income" | "expense" } | null {
  if (g.complete || !g.targetDate || g.monthsLeft == null) return null;
  const diff = differenceInCalendarMonths(new Date(g.targetDate), new Date()) - g.monthsLeft;
  if (diff > 0) return { kind: "ahead", months: diff, tone: "income" };
  if (diff === 0) return { kind: "onTrack", months: 0, tone: "income" };
  return { kind: "behind", months: -diff, tone: "expense" };
}

function GoalCard({
  goal: g,
  onEdit,
  onDelete,
  onContribute,
}: {
  goal: Goal;
  onEdit: () => void;
  onDelete: () => void;
  onContribute: (mode: "add" | "withdraw") => void;
}) {
  const { t } = useTranslation("planning");
  const eta =
    g.monthsLeft != null
      ? `${t("goals.months", { count: g.monthsLeft })} · ${format(addMonths(new Date(), g.monthsLeft), "MMM yyyy", { locale: dateFnsLocale() })}`
      : g.targetDate
        ? t("goals.targetOn", { date: fmtDate(g.targetDate, "dd MMM yyyy") })
        : null;
  const etaHelp =
    g.monthsLeft != null
      ? t("goals.etaHelp", { amount: formatMoney(g.monthlyContribution) })
      : t("goals.etaHelpEmpty");
  const sched = schedule(g);
  const schedLabel = sched
    ? sched.kind === "ahead"
      ? t("goals.aheadMonths", { count: sched.months })
      : sched.kind === "behind"
        ? t("goals.behindMonths", { count: sched.months })
        : t("goals.onTrack")
    : null;

  return (
    <Card className="relative flex h-full flex-col overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: g.color }} />
      <CardContent className="flex flex-1 flex-col gap-3 p-5">
        {/* header */}
        <div className="flex items-center gap-3">
          <CategoryIcon icon={g.icon} color={g.color} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{g.name}</p>
            <p className="tnum text-xs text-muted-foreground">
              {t("goals.savedOfTarget", { saved: formatMoney(g.savedAmount), target: formatMoney(g.targetAmount) })}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("goals.actionsFor", { name: g.name })}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {g.complete && (
                <DropdownMenuItem onClick={() => onContribute("add")}>
                  <Plus /> {t("goals.addMoney")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onContribute("withdraw")} disabled={g.savedAmount <= 0}>
                <Minus /> {t("goals.withdraw")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> {t("actions.edit", { ns: "common" })}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> {t("actions.delete", { ns: "common" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Progress
          value={g.percent}
          indicatorClassName={g.complete ? "bg-income" : undefined}
          tooltip={
            <span className="tnum">
              {t("goals.savedOfTarget", { saved: formatMoney(g.savedAmount), target: formatMoney(g.targetAmount) })} · {g.percent}%
              {g.complete
                ? ` · ${t("actions.done", { ns: "common" })}`
                : ` · ${t("goals.amountToGo", { amount: formatMoney(g.remaining) })}`}
            </span>
          }
        />

        {/* status */}
        <div className="flex items-center justify-between text-sm">
          {g.complete ? (
            <Badge variant="income" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> {t("goals.completed")}
            </Badge>
          ) : (
            <span className="tnum font-medium text-income">
              {t("goals.amountToGo", { amount: formatMoney(g.remaining) })}
            </span>
          )}
          <span className="tnum text-xs text-muted-foreground">{g.percent}%</span>
        </div>

        {/* footer: ETA (active) or achieved date (completed) */}
        <div className="mt-auto space-y-3 pt-1">
          {g.complete ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-income">
              <Trophy className="h-3.5 w-3.5" />
              {g.achievedAt
                ? t("goals.achievedOn", { date: fmtDate(g.achievedAt, "dd MMM yyyy") })
                : t("goals.achieved")}
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2 text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {eta ?? t("goals.noEta")}
                    <Info className="h-3 w-3 opacity-60" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-[220px] text-xs">{etaHelp}</TooltipContent>
              </Tooltip>
              {sched && (
                <span
                  className={cn(
                    "shrink-0 font-medium",
                    sched.tone === "income" ? "text-income" : "text-expense"
                  )}
                >
                  {schedLabel}
                </span>
              )}
            </div>
          )}

          {!g.complete && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => onContribute("add")}>
              <Plus /> {t("goals.addMoney")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ContributeDialog({
  state,
  onClose,
}: {
  state: ContributeState | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("planning");
  const contribute = useContributeGoal();
  const [amount, setAmount] = useState("");

  const goal = state?.goal;
  const mode = state?.mode ?? "add";
  const isAdd = mode === "add";

  const n = Math.max(0, Number(amount) || 0);
  const delta = isAdd ? n : -n;
  const projected = goal ? Math.max(0, goal.savedAmount + delta) : 0;
  const projectedPct =
    goal && goal.targetAmount > 0 ? Math.min(Math.round((projected / goal.targetAmount) * 100), 100) : 0;

  const quick = isAdd ? [500, 1000, 5000] : [500, 1000, 5000];

  async function submit() {
    if (!goal) return;
    if (!n || n <= 0) return toast.error(t("contribute.enterAmount"));
    if (!isAdd && n > goal.savedAmount) return toast.error(t("contribute.cantWithdrawMore"));
    try {
      await contribute.mutateAsync({ id: goal._id, amount: delta });
      toast.success(
        isAdd
          ? t("contribute.added", { amount: formatMoney(n), name: goal.name })
          : t("contribute.withdrew", { amount: formatMoney(n), name: goal.name })
      );
      setAmount("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("contribute.failed"));
    }
  }

  return (
    <Dialog
      open={Boolean(goal)}
      onOpenChange={(o) => {
        if (!o) {
          setAmount("");
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isAdd
              ? t("contribute.addTo", { name: goal?.name ?? "" })
              : t("contribute.withdrawFrom", { name: goal?.name ?? "" })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contrib">{t("labels.amount", { ns: "common" })}</Label>
            <AmountInput
              id="contrib"
              autoFocus
              value={amount}
              onChange={setAmount}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="1,000"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quick.map((q) => (
                <Button
                  key={q}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String(q))}
                >
                  {isAdd ? "+" : "−"}
                  {formatMoney(q)}
                </Button>
              ))}
              {isAdd && goal && goal.remaining > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String(goal.remaining))}
                >
                  {t("contribute.fillRemaining")}
                </Button>
              )}
              {!isAdd && goal && goal.savedAmount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String(goal.savedAmount))}
                >
                  {t("contribute.withdrawAll")}
                </Button>
              )}
            </div>
          </div>

          {/* live preview */}
          {goal && (
            <div className="space-y-1.5 rounded-lg border p-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tnum">
                  {formatMoney(goal.savedAmount)} → <span className="font-semibold text-foreground">{formatMoney(projected)}</span>
                </span>
                <span className="tnum">{projectedPct}%</span>
              </div>
              <Progress value={projectedPct} />
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {t("contribute.note")}
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              setAmount("");
              onClose();
            }}
          >
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={contribute.isPending}>
            {isAdd ? t("goals.addMoney") : t("goals.withdraw")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
