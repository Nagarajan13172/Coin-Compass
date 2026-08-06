import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Split } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useApplySplit, usePendingSplits } from "@/hooks/useStocks";
import { fmtDate } from "@/lib/dates";

/**
 * Prompts for splits and bonus issues that have happened since purchase.
 *
 * The market price adjusts the moment a split takes effect, but stored lots do
 * not — so until this is applied the position reads as a sudden large loss. It
 * is deliberately a prompt rather than an automatic correction: changing how many
 * shares someone owns without asking is worse than showing them a number they can
 * question. Applying it multiplies quantity and divides the buy price, so what
 * was paid — and therefore net worth — does not move.
 */
export function PendingSplitsBanner() {
  const { t } = useTranslation("stocks");
  const { data: splits } = usePendingSplits();
  const apply = useApplySplit();

  if (!splits?.length) return null;

  async function confirm(symbol: string, date: string, ticker: string) {
    try {
      await apply.mutateAsync({ symbol, date });
      toast.success(t("splits.applied", { ticker }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  return (
    <div className="mb-5 space-y-3">
      {splits.map((s) => (
        <Card key={`${s.symbol}-${s.date}`} className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-500">
                <Split className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t("splits.title", { ticker: s.ticker, label: s.label })}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("splits.description", {
                    date: fmtDate(s.date),
                    before: s.qtyBefore,
                    after: s.qtyAfter,
                  })}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("splits.costUnchanged")}</p>
              </div>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              disabled={apply.isPending}
              onClick={() => confirm(s.symbol, s.date, s.ticker)}
            >
              {t("splits.apply")}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
