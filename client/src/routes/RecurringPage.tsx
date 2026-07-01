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
import { isDue, isEnded, monthlyAmount, ruleTitle } from "@/lib/recurring";
import { formatMoney } from "@/lib/format";
import type { Recurring } from "@/lib/types";
import { toast } from "sonner";

function freqLabel(r: Recurring) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.frequency];
  return r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
}

/** Normalized per-month cash-flow across all active rules, for the overview strip. */
function MonthlySummary({ items }: { items: Recurring[] }) {
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
          <p className="text-xs text-muted-foreground">Monthly income</p>
          <p className="mt-0.5 font-semibold tnum text-income">+{formatMoney(income)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground">Monthly expenses</p>
          <p className="mt-0.5 font-semibold tnum text-expense">−{formatMoney(expense)}</p>
        </div>
        <div className="p-3">
          <p className="text-xs text-muted-foreground">Net / month</p>
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
  const { data: items, isLoading } = useRecurring();
  const del = useDeleteRecurring();
  const update = useUpdateRecurring();
  const runOne = useRunRecurringOne();
  const skip = useSkipRecurring();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [historyFor, setHistoryFor] = useState<Recurring | null>(null);
  const [runDueOpen, setRunDueOpen] = useState(false);

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
    toast.success(res.created ? `Posted ${res.created} transaction(s)` : "Nothing due for this rule");
  }

  async function skipNext(r: Recurring) {
    await skip.mutateAsync(r._id);
    toast.success("Skipped the next occurrence");
  }

  return (
    <div>
      <PageHeader
        title="Recurring"
        description="Automatically post rent, salary, subscriptions and other regular transactions."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRunDueOpen(true)} disabled={!items?.length}>
              <RefreshCw /> Run due
              {dueCount > 0 && (
                <Badge variant="warning" className="ml-1 px-1.5">
                  {dueCount}
                </Badge>
              )}
            </Button>
            <Button onClick={openNew}>
              <Plus /> New rule
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
                        <p className="truncate font-medium">{ruleTitle(r)}</p>
                        {overdue && <Badge variant="warning">Overdue</Badge>}
                        {ended && <Badge variant="secondary">Ended</Badge>}
                        {!r.active && !ended && <Badge variant="secondary">Paused</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {freqLabel(r)} · {r.account?.name}
                      </p>
                      <p className={`mt-0.5 truncate text-xs ${overdue ? "text-amber-600 dark:text-amber-500" : "text-muted-foreground"}`}>
                        {ended
                          ? `Ended ${format(new Date(r.endDate as string), "dd MMM yyyy")}`
                          : !r.active
                            ? "Paused"
                            : overdue
                              ? `Overdue since ${format(new Date(r.nextRun), "dd MMM yyyy")}`
                              : `Next ${format(new Date(r.nextRun), "dd MMM yyyy")}`}
                        {r.active && !overdue && r.endDate
                          ? ` · Ends ${format(new Date(r.endDate), "dd MMM yyyy")}`
                          : ""}
                        {r.lastRun ? ` · Last posted ${format(new Date(r.lastRun), "dd MMM")}` : ""}
                      </p>
                    </div>
                    <Money amount={r.amount} type={r.type} signed className="text-sm" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Recurring actions">
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}>
                          <Pencil /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => runOneNow(r)} disabled={runOne.isPending}>
                          <Zap /> Run now
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => skipNext(r)} disabled={skip.isPending}>
                          <SkipForward /> Skip next
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => update.mutate({ id: r._id, active: !r.active })}
                        >
                          {r.active ? <Pause /> : <Play />} {r.active ? "Pause" : "Resume"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setHistoryFor(r)}>
                          <History /> View posted
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={async () => {
                            if (confirm("Delete this recurring rule?")) {
                              await del.mutateAsync(r._id);
                              toast.success("Deleted");
                            }
                          }}
                        >
                          <Trash2 /> Delete
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
          title="No recurring transactions"
          description="Automate rent, salary, subscriptions and more."
          action={
            <Button onClick={openNew}>
              <Plus /> New recurring
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
    </div>
  );
}
