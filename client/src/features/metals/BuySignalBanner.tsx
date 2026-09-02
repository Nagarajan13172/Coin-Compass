import { useTranslation } from "react-i18next";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BuySignal } from "./buySignal";

/**
 * The verdict: is today cheap, dear, or ordinary against its own recent history?
 *
 * This is the one thing on the page someone actually acts on, so it reads as a
 * conclusion rather than another statistic — tinted to its answer, with the
 * reasoning underneath and the averages it came from alongside.
 *
 * The wording stays careful on purpose. "Below its recent average" is a fact;
 * "prices will rise" would be a forecast, and nothing here can know that.
 */
export function BuySignalBanner({
  signal,
  days,
  averages,
  className,
}: {
  signal: BuySignal;
  /** The window the verdict was measured over — the range on screen. */
  days: number;
  averages: { days: number; average: number }[];
  className?: string;
}) {
  const { t } = useTranslation("credits");
  if (!signal.average) return null;

  const { verdict } = signal;
  const Icon = verdict === "good" ? TrendingDown : verdict === "high" ? TrendingUp : Minus;

  const tone = {
    good: {
      wrap: "border-income/30 bg-income/[0.07]",
      badge: "bg-income/15 text-income",
      title: "text-income",
    },
    high: {
      wrap: "border-expense/30 bg-expense/[0.07]",
      badge: "bg-expense/15 text-expense",
      title: "text-expense",
    },
    fair: {
      wrap: "border-border bg-muted/40",
      badge: "bg-muted-foreground/10 text-muted-foreground",
      title: "text-foreground",
    },
  }[verdict];

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-5 gap-y-4 rounded-xl border p-4",
        tone.wrap,
        className
      )}
    >
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-3.5">
        <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", tone.badge)}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className={cn("text-base font-semibold leading-tight", tone.title)}>
            {t(`gold.signal.${verdict}`)}
          </p>
          <p className="tnum mt-0.5 text-sm text-muted-foreground">
            {t("gold.signal.detail", {
              pct: Math.abs(signal.diffPct).toFixed(2),
              amount: formatMoney(Math.abs(signal.diff), { currency: "INR" }),
              direction: t(`gold.signal.${signal.diff < 0 ? "under" : "over"}`),
              days,
            })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t(`gold.signal.advice.${verdict}`)}</p>
        </div>
      </div>

      {/* What the verdict was measured against. */}
      <div className="flex shrink-0 flex-wrap items-stretch gap-2">
        {averages
          .filter((w) => w.average > 0)
          .map((w) => (
            <div
              key={w.days}
              className={cn(
                "rounded-lg border bg-background/60 px-3 py-2 text-center",
                w.days === days && "border-primary/40"
              )}
            >
              <p className="text-[11px] text-muted-foreground">
                {t("gold.signal.avgDays", { days: w.days })}
              </p>
              <p className="tnum text-sm font-semibold">
                {formatMoney(w.average, { currency: "INR" })}
              </p>
            </div>
          ))}
      </div>
    </div>
  );
}
