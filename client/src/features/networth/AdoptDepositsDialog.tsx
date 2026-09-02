import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { useAdoptTransactions, useDepositCandidates } from "@/hooks/useHoldings";
import { fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { Holding, RefLite, Transaction } from "@/lib/types";

interface Props {
  holding: Holding | null;
  onClose: () => void;
}

function ref(value: RefLite | string | null | undefined): RefLite | null {
  return value && typeof value === "object" ? value : null;
}

/**
 * Adopt past spending as payments into this deposit.
 *
 * Every RD instalment recorded before deposits existed is sitting in the ledger
 * as an expense — dragging down both the spending charts and net worth. Entering
 * them again as fresh deposits would double the money, so this reclassifies the
 * rows already there: same account, same date, same amount, now a transfer into
 * the deposit.
 *
 * The list is a suggestion, not a rule — it offers spends from the savings
 * category group and ones whose note or payee names the holding, and the user
 * confirms which were really this deposit.
 */
export function AdoptDepositsDialog({ holding, onClose }: Props) {
  const { t } = useTranslation("wealth");
  const { data: candidates, isLoading } = useDepositCandidates(holding?._id ?? null);
  const adopt = useAdoptTransactions();
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    setPicked(new Set());
  }, [holding]);

  const rows: Transaction[] = candidates ?? [];
  const total = useMemo(
    () => rows.filter((r) => picked.has(r._id)).reduce((s, r) => s + r.amount, 0),
    [rows, picked]
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!holding || picked.size === 0) return;
    try {
      const result = await adopt.mutateAsync({ id: holding._id, transactions: [...picked] });
      toast.success(
        t("adopt.done", { count: result.adopted, amount: formatMoney(result.total), name: holding.name })
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  return (
    <Dialog open={Boolean(holding)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("adopt.title")}</DialogTitle>
          <DialogDescription>{holding && t("adopt.subtitle", { name: holding.name })}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
            <Skeleton className="h-14 w-full rounded-lg" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("adopt.none")}</p>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-xs">
              <span className="text-muted-foreground">{t("adopt.found", { count: rows.length })}</span>
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() =>
                  setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r._id)))
                }
              >
                {picked.size === rows.length ? t("adopt.clearAll") : t("adopt.selectAll")}
              </button>
            </div>
            <ul className="max-h-[45dvh] space-y-1.5 overflow-y-auto">
              {rows.map((r) => {
                const on = picked.has(r._id);
                const category = ref(r.category as RefLite | string | null);
                const account = ref(r.account as RefLite | string);
                return (
                  <li key={r._id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(r._id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-colors ${
                        on ? "border-primary bg-primary/5" : "hover:bg-accent"
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                          on ? "border-primary bg-primary text-primary-foreground" : "border-input"
                        }`}
                      >
                        {on && <Check className="size-3.5" />}
                      </span>
                      {category && <CategoryIcon icon={category.icon} color={category.color} size="sm" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {r.note || r.payee || category?.name || t("adopt.untitled")}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {fmtDate(r.date)}
                          {account ? ` · ${account.name}` : ""}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-sm font-semibold">{formatMoney(r.amount)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {picked.size > 0 && (
              <p className="rounded-lg border bg-muted/40 p-3 text-sm">
                {t("adopt.preview", { count: picked.size, amount: formatMoney(total) })}
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={adopt.isPending}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={adopt.isPending || picked.size === 0}>
            {adopt.isPending ? t("states.saving", { ns: "common" }) : t("adopt.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
