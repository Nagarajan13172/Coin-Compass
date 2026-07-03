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
import { dateFnsLocale } from "@/lib/dates";
import type { Recurring } from "@/lib/types";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recurring: Recurring | null;
}

export function RecurringOccurrencesDialog({ open, onOpenChange, recurring }: Props) {
  const { t } = useTranslation("recurring");
  const { data: items, isLoading } = useRecurringTransactions(open ? recurring?._id ?? null : null);
  const del = useDeleteTransaction();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("occurrences.title")}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-1">
            {items.map((txn) => (
              <div key={txn._id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium tabular-nums">
                    {format(new Date(txn.date), "dd MMM yyyy", { locale: dateFnsLocale() })}
                  </p>
                  {txn.note?.trim() && (
                    <p className="truncate text-xs text-muted-foreground">{txn.note}</p>
                  )}
                </div>
                <Money amount={txn.amount} type={txn.type} signed currency={txn.currency} className="text-sm" />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("occurrences.deleteAria")}
                  disabled={del.isPending}
                  onClick={async () => {
                    await del.mutateAsync(txn._id);
                    // Refresh this rule's history list (invalidateMoney doesn't cover it).
                    queryClient.invalidateQueries({ queryKey: ["recurring"] });
                    toast.success(t("occurrences.toast.deleted"));
                  }}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {t("occurrences.empty")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
