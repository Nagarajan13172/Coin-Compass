import { useState } from "react";
import { motion } from "motion/react";
import { MoreVertical, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { formatMoney } from "@/lib/format";
import { useBudgets, useDeleteBudget } from "@/hooks/useBudgets";
import { BudgetFormDialog } from "@/features/budgets/BudgetFormDialog";
import type { Budget } from "@/lib/types";
import { toast } from "sonner";

const periodLabel = { weekly: "This week", monthly: "This month", yearly: "This year" };

export default function BudgetsPage() {
  const { data: budgets, isLoading } = useBudgets();
  const del = useDeleteBudget();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(b: Budget) {
    setEditing(b);
    setDialogOpen(true);
  }
  async function handleDelete(b: Budget) {
    if (!confirm("Delete this budget?")) return;
    await del.mutateAsync(b._id);
    toast.success("Budget deleted");
  }

  return (
    <div>
      <PageHeader
        title="Budgets"
        description="Set spending limits and track progress"
        actions={
          <Button onClick={openNew}>
            <Plus /> New budget
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : budgets && budgets.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {budgets.map((b, i) => {
            const pct = Math.min(b.percent, 100);
            const tone = b.over ? "bg-expense" : b.percent > 80 ? "bg-amber-500" : "bg-income";
            return (
              <motion.div
                key={b._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
              >
                <Card>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center gap-3">
                      <CategoryIcon icon={b.category?.icon} color={b.category?.color} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{b.category?.name ?? "Overall"}</p>
                        <p className="text-xs text-muted-foreground">{periodLabel[b.period]}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Budget actions">
                            <MoreVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(b)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => handleDelete(b)}
                          >
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <Progress value={pct} indicatorClassName={tone} />

                    <div className="flex items-center justify-between text-sm">
                      <span className="tnum text-muted-foreground">
                        {formatMoney(b.spent)} of {formatMoney(b.amount)}
                      </span>
                      {b.over ? (
                        <Badge variant="expense">Over by {formatMoney(b.spent - b.amount)}</Badge>
                      ) : (
                        <span className="tnum font-medium text-income">
                          {formatMoney(b.remaining)} left
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title="No budgets yet"
          description="Create a budget to keep your spending on track."
          action={
            <Button onClick={openNew}>
              <Plus /> New budget
            </Button>
          }
        />
      )}

      <BudgetFormDialog open={dialogOpen} onOpenChange={setDialogOpen} budget={editing} />
    </div>
  );
}
