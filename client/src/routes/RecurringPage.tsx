import { useState } from "react";
import { format } from "date-fns";
import { motion } from "motion/react";
import { MoreVertical, Pause, Pencil, Play, Plus, Repeat, RefreshCw, Trash2 } from "lucide-react";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import {
  useDeleteRecurring,
  useRecurring,
  useRunRecurring,
  useUpdateRecurring,
} from "@/hooks/useRecurring";
import { RecurringFormDialog } from "@/features/recurring/RecurringFormDialog";
import type { Recurring } from "@/lib/types";
import { toast } from "sonner";

function freqLabel(r: Recurring) {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[r.frequency];
  return r.interval === 1 ? `Every ${unit}` : `Every ${r.interval} ${unit}s`;
}

export default function RecurringPage() {
  const { data: items, isLoading } = useRecurring();
  const del = useDeleteRecurring();
  const update = useUpdateRecurring();
  const run = useRunRecurring();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(r: Recurring) {
    setEditing(r);
    setDialogOpen(true);
  }

  async function runNow() {
    const res = await run.mutateAsync();
    toast.success(res.created ? `Posted ${res.created} due transaction(s)` : "Nothing due right now");
  }

  return (
    <div>
      <PageHeader
        title="Recurring"
        description="Standing orders & scheduled transactions"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={runNow} disabled={run.isPending}>
              <RefreshCw className={run.isPending ? "animate-spin" : ""} /> Run due
            </Button>
            <Button onClick={openNew}>
              <Plus /> New
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items && items.length > 0 ? (
        <div className="space-y-3">
          {items.map((r, i) => (
            <motion.div
              key={r._id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
            >
              <Card>
                <CardContent className="flex items-center gap-4 p-4">
                  <CategoryIcon
                    icon={r.type === "transfer" ? "repeat" : r.category?.icon}
                    color={r.type === "transfer" ? "#3B82F6" : r.category?.color}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">
                        {r.type === "transfer" ? "Transfer" : r.category?.name ?? (r.note || "Recurring")}
                      </p>
                      {!r.active && <Badge variant="secondary">Paused</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {freqLabel(r)} · {r.account?.name} · Next {format(new Date(r.nextRun), "dd MMM yyyy")}
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
                      <DropdownMenuItem
                        onClick={() => update.mutate({ id: r._id, active: !r.active })}
                      >
                        {r.active ? <Pause /> : <Play />} {r.active ? "Pause" : "Resume"}
                      </DropdownMenuItem>
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
          ))}
        </div>
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

      <RecurringFormDialog open={dialogOpen} onOpenChange={setDialogOpen} recurring={editing} />
    </div>
  );
}
