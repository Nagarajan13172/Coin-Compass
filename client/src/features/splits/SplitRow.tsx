import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Trash2, Users } from "lucide-react";
import { Money } from "@/components/common/Money";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { useSplits, useDeleteSplit } from "@/hooks/useSplits";
import { formatMoney } from "@/lib/format";
import { splitOutstanding, isSplitSettled } from "@/lib/splits";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";
import { TransactionRow } from "@/features/transactions/TransactionRow";

/**
 * One shared bill, as a single ledger row.
 *
 * A six-way split posts six transactions — your expense plus a transfer per
 * person — and shown raw they bury the rest of the day. Collapsed, the row says
 * what actually matters: the bill, your share of it, and what's still owed.
 * Expanding reveals the individual legs as ordinary rows.
 */
export function SplitRow({ splitId, legs }: { splitId: string; legs: Transaction[] }) {
  const { t } = useTranslation("splits");
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { data: splits } = useSplits();
  const deleteSplit = useDeleteSplit();

  const split = splits?.find((s) => s._id === splitId);

  // The split's own record is the source of truth for shares. Until it loads (or
  // if it has since been dissolved), fall back to the legs so the row still shows
  // real numbers rather than blanks.
  const total = split?.totalAmount ?? legs.reduce((sum, l) => sum + l.amount, 0);
  const yourShare = split?.yourShare ?? legs.find((l) => l.type === "expense")?.amount ?? 0;
  const owed = split ? splitOutstanding(split) : total - yourShare;
  const settled = split ? isSplitSettled(split) : false;
  const headcount = (split?.participants.length ?? legs.length - 1) + 1;
  const description = split?.description || legs.find((l) => l.payee)?.payee || t("row.sharedBill");

  async function handleDelete() {
    try {
      await deleteSplit.mutateAsync(splitId);
      toast.success(t("toast.deleted"), { description });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.deleteFailed"));
      throw e; // keep the confirm dialog open so the user can retry
    }
  }

  return (
    <div className="rounded-lg border border-dashed">
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <Users className="h-4 w-4 text-muted-foreground" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium">{description}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  expanded && "rotate-180"
                )}
              />
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {t("row.summary", { total: formatMoney(total), count: headcount })}
            </span>
          </span>
        </button>

        <div className="shrink-0 text-right">
          <Money amount={yourShare} type="expense" className="text-sm" />
          <p
            className={cn(
              "mt-0.5 text-[11px] tabular-nums",
              settled ? "text-income" : "text-muted-foreground"
            )}
          >
            {settled ? t("row.settled") : t("row.owedBack", { amount: formatMoney(owed) })}
          </p>
        </div>

        {split && (
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            aria-label={t("row.deleteBill", { description })}
            className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="space-y-0.5 border-t border-dashed px-1 py-1">
          <p className="px-2 pb-0.5 pt-1 text-[11px] text-muted-foreground">
            {t("row.yourShareOf", { yours: formatMoney(yourShare), total: formatMoney(total) })}
          </p>
          {legs.map((leg) => (
            <TransactionRow key={leg._id} txn={leg} showTime />
          ))}
        </div>
      )}

      <ConfirmDeleteDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        itemKey="split"
        confirmValue={String(total)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
