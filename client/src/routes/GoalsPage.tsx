import { useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { fmtDate } from "@/lib/dates";
import { useGoals, useDeleteGoal, useContributeGoal } from "@/hooks/useGoals";
import { GoalFormDialog } from "@/features/goals/GoalFormDialog";
import type { Goal } from "@/lib/types";
import { toast } from "sonner";

type ContributeState = { goal: Goal; mode: "add" | "withdraw" };

export default function GoalsPage() {
  const { data: goals, isLoading } = useGoals();
  const del = useDeleteGoal();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contributing, setContributing] = useState<ContributeState | null>(null);

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
  async function handleDelete(g: Goal) {
    if (!confirm(`Delete goal "${g.name}"?`)) return;
    await del.mutateAsync(g._id);
    toast.success("Goal deleted");
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
          onDelete={() => handleDelete(g)}
          onContribute={(mode) => setContributing({ goal: g, mode })}
        />
      </motion.div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Goals"
        description="Save towards what matters"
        actions={
          <Button onClick={openNew}>
            <Plus /> New goal
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
                  <p className="text-sm text-muted-foreground">Total saved</p>
                  <p className="tnum text-3xl font-extrabold">{formatMoney(totalSaved)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    All-time · {active.length} active
                    {completed.length > 0 && ` · ${completed.length} completed`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tnum text-sm text-muted-foreground">of {formatMoney(totalTarget)}</p>
                  <p className="tnum text-lg font-semibold">{overallPct}%</p>
                </div>
              </div>
              <Progress value={overallPct} />
            </CardContent>
          </Card>

          {/* active */}
          {active.length > 0 && (
            <section className="space-y-3">
              {completed.length > 0 && <SectionHeading title="Active goals" count={active.length} />}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {active.map(renderCard)}
              </div>
            </section>
          )}

          {/* completed */}
          {completed.length > 0 && (
            <section className="space-y-3">
              <SectionHeading title="Completed" count={completed.length} />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {completed.map(renderCard)}
              </div>
            </section>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Set a savings goal like a trip or a new gadget and track your progress."
          action={
            <Button onClick={openNew}>
              <Plus /> New goal
            </Button>
          }
        />
      )}

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} />
      <ContributeDialog state={contributing} onClose={() => setContributing(null)} />
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

/** On-track / ahead / behind vs the target date, from the planned ETA. */
function schedule(g: Goal): { label: string; tone: "income" | "expense" } | null {
  if (g.complete || !g.targetDate || g.monthsLeft == null) return null;
  const diff = differenceInCalendarMonths(new Date(g.targetDate), new Date()) - g.monthsLeft;
  if (diff > 0) return { label: `Ahead ${diff} mo`, tone: "income" };
  if (diff === 0) return { label: "On track", tone: "income" };
  return { label: `Behind ${-diff} mo`, tone: "expense" };
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
  const eta =
    g.monthsLeft != null
      ? `~${g.monthsLeft} month${g.monthsLeft === 1 ? "" : "s"} · ${format(addMonths(new Date(), g.monthsLeft), "MMM yyyy")}`
      : g.targetDate
        ? `Target ${fmtDate(g.targetDate, "dd MMM yyyy")}`
        : null;
  const etaHelp =
    g.monthsLeft != null
      ? `Estimated from your planned monthly saving of ${formatMoney(g.monthlyContribution)}.`
      : "Add a monthly saving amount to this goal to see a projected completion date.";
  const sched = schedule(g);

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
              {formatMoney(g.savedAmount)} of {formatMoney(g.targetAmount)}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${g.name}`}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {g.complete && (
                <DropdownMenuItem onClick={() => onContribute("add")}>
                  <Plus /> Add money
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onContribute("withdraw")} disabled={g.savedAmount <= 0}>
                <Minus /> Withdraw
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Progress
          value={g.percent}
          indicatorClassName={g.complete ? "bg-income" : undefined}
          tooltip={
            <span className="tnum">
              {formatMoney(g.savedAmount)} of {formatMoney(g.targetAmount)} · {g.percent}%
              {g.complete ? " · Done" : ` · ${formatMoney(g.remaining)} to go`}
            </span>
          }
        />

        {/* status */}
        <div className="flex items-center justify-between text-sm">
          {g.complete ? (
            <Badge variant="income" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Completed
            </Badge>
          ) : (
            <span className="tnum font-medium text-income">{formatMoney(g.remaining)} to go</span>
          )}
          <span className="tnum text-xs text-muted-foreground">{g.percent}%</span>
        </div>

        {/* footer: ETA (active) or achieved date (completed) */}
        <div className="mt-auto space-y-3 pt-1">
          {g.complete ? (
            <p className="flex items-center gap-1.5 text-xs font-medium text-income">
              <Trophy className="h-3.5 w-3.5" />
              Achieved{g.achievedAt ? ` ${fmtDate(g.achievedAt, "dd MMM yyyy")}` : ""}
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2 text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {eta ?? "No ETA yet"}
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
                  {sched.label}
                </span>
              )}
            </div>
          )}

          {!g.complete && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => onContribute("add")}>
              <Plus /> Add money
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
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    if (!isAdd && n > goal.savedAmount) return toast.error("Can't withdraw more than saved");
    try {
      await contribute.mutateAsync({ id: goal._id, amount: delta });
      toast.success(`${isAdd ? "Added" : "Withdrew"} ${formatMoney(n)} · ${goal.name}`);
      setAmount("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
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
            {isAdd ? "Add to" : "Withdraw from"} {goal?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="contrib">Amount</Label>
            <Input
              id="contrib"
              type="number"
              inputMode="decimal"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="1000"
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
                  Fill remaining
                </Button>
              )}
              {!isAdd && goal && goal.savedAmount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAmount(String(goal.savedAmount))}
                >
                  Withdraw all
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
            Updates this goal's progress only — it doesn't move money between your accounts.
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
            Cancel
          </Button>
          <Button onClick={submit} disabled={contribute.isPending}>
            {isAdd ? "Add money" : "Withdraw"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
