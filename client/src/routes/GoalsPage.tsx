import { useState } from "react";
import { motion } from "motion/react";
import { addMonths, format } from "date-fns";
import { CheckCircle2, MoreVertical, Pencil, Plus, Target, Trash2, TrendingUp } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/lib/format";
import { fmtDate } from "@/lib/dates";
import { useGoals, useDeleteGoal, useContributeGoal } from "@/hooks/useGoals";
import { GoalFormDialog } from "@/features/goals/GoalFormDialog";
import type { Goal } from "@/lib/types";
import { toast } from "sonner";

export default function GoalsPage() {
  const { data: goals, isLoading } = useGoals();
  const del = useDeleteGoal();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [contributing, setContributing] = useState<Goal | null>(null);

  const totalSaved = goals?.reduce((s, g) => s + g.savedAmount, 0) ?? 0;
  const totalTarget = goals?.reduce((s, g) => s + g.targetAmount, 0) ?? 0;

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
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : goals && goals.length > 0 ? (
        <>
          <Card className="surface-gradient mb-5">
            <CardContent className="flex flex-wrap items-end justify-between gap-4 p-5">
              <div>
                <p className="text-sm text-muted-foreground">Total saved</p>
                <p className="tnum text-3xl font-extrabold">{formatMoney(totalSaved)}</p>
              </div>
              <p className="tnum text-sm text-muted-foreground">
                of {formatMoney(totalTarget)} across {goals.length} {goals.length === 1 ? "goal" : "goals"}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {goals.map((g, i) => (
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
                  onContribute={() => setContributing(g)}
                />
              </motion.div>
            ))}
          </div>
        </>
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
      <ContributeDialog goal={contributing} onClose={() => setContributing(null)} />
    </div>
  );
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
  onContribute: () => void;
}) {
  const eta =
    g.monthsLeft != null
      ? `~${g.monthsLeft} month${g.monthsLeft === 1 ? "" : "s"} · ${format(addMonths(new Date(), g.monthsLeft), "MMM yyyy")}`
      : g.targetDate
        ? `Target ${fmtDate(g.targetDate, "dd MMM yyyy")}`
        : null;

  return (
    <Card className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: g.color }} />
      <CardContent className="space-y-3 p-5">
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
              <Button variant="ghost" size="icon-sm" aria-label="Goal actions">
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Progress value={g.percent} indicatorClassName={g.complete ? "bg-income" : undefined} />

        <div className="flex items-center justify-between text-sm">
          {g.complete ? (
            <Badge variant="income" className="gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Reached
            </Badge>
          ) : (
            <span className="tnum font-medium text-income">{formatMoney(g.remaining)} to go</span>
          )}
          <span className="tnum text-xs text-muted-foreground">{g.percent}%</span>
        </div>

        {!g.complete && eta && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> {eta}
          </p>
        )}

        <Button variant="outline" size="sm" className="w-full" onClick={onContribute}>
          <Plus /> Add money
        </Button>
      </CardContent>
    </Card>
  );
}

function ContributeDialog({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const contribute = useContributeGoal();
  const [amount, setAmount] = useState("");

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("Enter an amount greater than 0");
    try {
      await contribute.mutateAsync({ id: goal!._id, amount: n });
      toast.success(`Added ${formatMoney(n)} to ${goal!.name}`);
      setAmount("");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  return (
    <Dialog open={Boolean(goal)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Add to {goal?.name}</DialogTitle>
        </DialogHeader>
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={contribute.isPending}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
