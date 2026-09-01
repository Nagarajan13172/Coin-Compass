import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, Receipt, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import { fmtDate } from "@/lib/dates";
import {
  unsettledParticipants,
  splitOutstanding,
  isSplitSettled,
  isParticipantSettled,
} from "@/lib/splits";
import { cn } from "@/lib/utils";
import { useSplits } from "@/hooks/useSplits";
import type { Split, SplitParticipant } from "@/lib/types";
import type { CreditPrefill } from "@/features/credits/CreditFormDialog";

/**
 * Shared bills, on the Credits page — where settling up already lives.
 *
 * Each bill lists who still owes, with a one-tap settle that pre-fills the credit
 * form with the exact amount in the "received" direction. That routes through the
 * existing credit flow, so a repayment stays a TRANSFER back out of "Money Lent"
 * and never lands as income.
 */
export function SplitsSection({ onSettle }: { onSettle: (prefill: CreditPrefill) => void }) {
  const { t } = useTranslation("splits");
  const { data: splits } = useSplits();

  // Bills with something still owed come first; fully-settled ones stay visible
  // but sink, so the section reads as a to-do list rather than a history.
  const ordered = useMemo(() => {
    const rows = splits ?? [];
    return [...rows].sort((a, b) => Number(isSplitSettled(a)) - Number(isSplitSettled(b)));
  }, [splits]);

  if (!ordered.length) return null;

  const totalOwed = ordered.reduce((sum, s) => sum + splitOutstanding(s), 0);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          {t("section.title")}
        </CardTitle>
        {totalOwed > 0 && (
          <Badge variant="secondary" className="tabular-nums">
            {t("section.totalOwed", { amount: formatMoney(totalOwed) })}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {ordered.map((split) => (
          <BillRow key={split._id} split={split} onSettle={onSettle} />
        ))}
      </CardContent>
    </Card>
  );
}

function BillRow({ split, onSettle }: { split: Split; onSettle: (p: CreditPrefill) => void }) {
  const { t } = useTranslation("splits");
  const unsettled = unsettledParticipants(split);
  const accountId = typeof split.account === "string" ? split.account : split.account?._id;

  /**
   * Settle exactly this person's share of THIS bill, back into the paying
   * account. `settles` aims the repayment at that share, so it clears this row
   * rather than whichever of their debts happens to be oldest.
   */
  function settle(p: SplitParticipant) {
    onSettle({
      person: p.person,
      personId: p.personId ?? null,
      direction: "received",
      amount: p.outstanding,
      account: accountId,
      settles: p.credit,
    });
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{split.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{fmtDate(split.date)}</span>
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {t("section.headcount", { count: split.participants.length + 1 })}
            </span>
            <span>{t("section.billTotal", { amount: formatMoney(split.totalAmount) })}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-expense">
            {formatMoney(split.yourShare)}
          </p>
          <p className="text-[11px] text-muted-foreground">{t("section.yourShare")}</p>
        </div>
      </div>

      {unsettled.length === 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-income">
          <Check className="h-3.5 w-3.5" />
          {t("section.everyoneSettled")}
        </p>
      )}

      {/* Everyone stays listed. A settled share is struck through rather than
          removed, so the bill still shows who was on it — and, crucially, so
          settling gives visible feedback instead of leaving the row unchanged. */}
      {split.participants.length > 0 && (
        <div className="mt-2 space-y-1 border-t pt-2">
          {split.participants.map((p) => {
            const done = isParticipantSettled(p);
            return (
              <div key={p.credit} className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 truncate text-sm",
                    done && "text-muted-foreground line-through"
                  )}
                >
                  {p.person}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={cn(
                      "text-sm tabular-nums",
                      done ? "text-muted-foreground line-through" : "font-medium"
                    )}
                  >
                    {formatMoney(done ? p.amount : p.outstanding)}
                  </span>
                  {done ? (
                    <span className="flex items-center gap-1 text-xs text-income">
                      <Check className="h-3.5 w-3.5" />
                      {t("section.settled")}
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => settle(p)}>
                      {t("section.settleUp")}
                    </Button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
