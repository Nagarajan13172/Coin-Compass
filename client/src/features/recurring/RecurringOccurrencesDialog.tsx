import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/common/Money";
import { useRecurringTransactions } from "@/hooks/useRecurring";
import { useDeleteTransaction } from "@/hooks/useTransactions";
import { queryClient } from "@/lib/queryClient";
import type { Recurring } from "@/lib/types";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recurring: Recurring | null;
}

export function RecurringOccurrencesDialog({ open, onOpenChange, recurring }: Props) {
  const { data: items, isLoading } = useRecurringTransactions(open ? recurring?._id ?? null : null);
  const del = useDeleteTransaction();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Posted transactions</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-1">
            {items.map((t) => (
              <div key={t._id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums">
                    {format(new Date(t.date), "dd MMM yyyy")}
                  </p>
                  {t.note?.trim() && (
                    <p className="truncate text-xs text-muted-foreground">{t.note}</p>
                  )}
                </div>
                <Money amount={t.amount} type={t.type} signed currency={t.currency} className="text-sm" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Delete transaction"
                  disabled={del.isPending}
                  onClick={async () => {
                    await del.mutateAsync(t._id);
                    // Refresh this rule's history list (invalidateMoney doesn't cover it).
                    queryClient.invalidateQueries({ queryKey: ["recurring"] });
                    toast.success("Transaction deleted");
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            This rule hasn't posted any transactions yet.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
