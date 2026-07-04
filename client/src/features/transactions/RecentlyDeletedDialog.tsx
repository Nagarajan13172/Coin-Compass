import { useTranslation } from "react-i18next";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "@/components/common/Money";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useDeletedTransactions, useRestoreTransaction } from "@/hooks/useTransactions";
import { TRASH_RETENTION_DAYS } from "@/lib/constants";
import { fmtDate } from "@/lib/dates";
import { categoryLabel } from "@/lib/i18nLabels";
import type { RefLite } from "@/lib/types";

function ref(v: RefLite | string | null | undefined): RefLite | null {
  return v && typeof v === "object" ? v : null;
}

/** The "Recently deleted" trash: soft-deleted transactions the user can restore
 *  before they're purged after the retention window. */
export function RecentlyDeletedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("transactions");
  const { data: items, isLoading } = useDeletedTransactions();
  const restore = useRestoreTransaction();

  async function handleRestore(id: string) {
    try {
      await restore.mutateAsync(id);
      toast.success(t("toast.restored"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.restoreFailed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("trash.title")}</DialogTitle>
          <DialogDescription>{t("trash.description", { days: TRASH_RETENTION_DAYS })}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : items && items.length > 0 ? (
          <div className="space-y-1">
            {items.map((txn) => {
              const category = ref(txn.category);
              const isTransfer = txn.type === "transfer";
              const title = isTransfer
                ? t("txnType.transfer", { ns: "common" })
                : category
                  ? categoryLabel(category.name)
                  : txn.note?.trim() || t(`txnType.${txn.type}`, { ns: "common" });
              return (
                <div key={txn._id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent">
                  <CategoryIcon
                    icon={isTransfer ? "repeat" : category?.icon}
                    color={isTransfer ? "#3B82F6" : category?.color}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(txn.date, "dd MMM yyyy")}
                      {txn.deletedAt
                        ? ` · ${t("trash.deletedOn", { date: fmtDate(txn.deletedAt, "dd MMM") })}`
                        : ""}
                    </p>
                  </div>
                  <Money
                    amount={txn.amount}
                    type={txn.type}
                    signed={!isTransfer}
                    currency={txn.currency}
                    className="text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restore.isPending}
                    onClick={() => handleRestore(txn._id)}
                  >
                    <RotateCcw /> {t("trash.restore")}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Trash2 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t("trash.empty")}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
