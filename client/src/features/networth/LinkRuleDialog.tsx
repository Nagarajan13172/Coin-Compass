import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format } from "date-fns";
import { Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLinkableRules, useLinkHoldingRule } from "@/hooks/useHoldings";
import { dateFnsLocale } from "@/lib/dates";
import { ruleToCadence } from "@/lib/instalments";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Holding, Recurring } from "@/lib/types";

/**
 * Adopting a recurring rule that was already running.
 *
 * Plenty of people set their RD up as an ordinary monthly expense long before
 * the app could model a deposit. Asking them to build the schedule again would
 * leave two rules debiting the same account, so this claims the one they have:
 * it keeps its id, its place in the schedule and everything it has posted.
 *
 * Only the payments it makes from here are affected by linking. The ones it
 * already posted are still sitting in the ledger as expenses — "Import past
 * payments" is what rewrites those, and it can find them precisely once the
 * rule belongs to the deposit.
 */
export function LinkRuleDialog({
  holding,
  onClose,
  onLinked,
}: {
  holding: Holding | null;
  onClose: () => void;
  /** Offer the import of what the rule already posted, once it's ours. */
  onLinked: (holding: Holding) => void;
}) {
  const { t } = useTranslation("wealth");
  const { data: rules, isLoading } = useLinkableRules(Boolean(holding));
  const link = useLinkHoldingRule();
  const [picked, setPicked] = useState("");

  useEffect(() => {
    if (holding) setPicked("");
  }, [holding]);

  const fmt = (iso: string) => format(new Date(iso), "dd MMM yyyy", { locale: dateFnsLocale() });

  async function submit() {
    if (!holding || !picked) return;
    try {
      const res = await link.mutateAsync({ id: holding._id, recurring: picked });
      toast.success(
        res.termCount
          ? t("linkRule.linkedWithTerm", { count: res.termCount })
          : t("linkRule.linked")
      );
      onClose();
      onLinked(holding);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failedToSave"));
    }
  }

  return (
    <Dialog open={Boolean(holding)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            {t("linkRule.title")}
          </DialogTitle>
          <DialogDescription>
            {t("linkRule.subtitle", { name: holding?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("linkRule.loading")}</p>
        ) : (rules ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{t("linkRule.none")}</p>
        ) : (
          <div className="space-y-2">
            {(rules ?? []).map((r: Recurring) => (
              <button
                key={r._id}
                type="button"
                onClick={() => setPicked(r._id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent",
                  picked === r._id && "border-primary bg-primary/5"
                )}
              >
                <div className="min-w-0 flex-1">
                  {/* The note first, not the category. Someone running an RD as
                      an expense had to pick *some* category to satisfy the form
                      — "Food & Dining" tells them nothing; "Insurance", which
                      they typed, tells them everything. */}
                  <p className="truncate text-sm font-medium">
                    {r.note || r.payee || r.category?.name || t("linkRule.untitled")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t(`instalment.cadenceAdverb.${ruleToCadence(r.frequency, r.interval)}`)}
                    {r.account?.name ? ` · ${r.account.name}` : ""}
                    {r.endDate ? ` · ${t("linkRule.ends", { date: fmt(r.endDate) })}` : ""}
                  </p>
                </div>
                <span className="tnum shrink-0 text-sm font-semibold">{formatMoney(r.amount)}</span>
              </button>
            ))}
          </div>
        )}

        {picked && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {t("linkRule.preview", { name: holding?.name ?? "" })}
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={!picked || link.isPending}>
            {t("linkRule.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
