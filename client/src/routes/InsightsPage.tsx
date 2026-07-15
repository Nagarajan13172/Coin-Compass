import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Lightbulb,
  Minus,
  Receipt,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { PeriodSwitcher } from "@/components/common/PeriodSwitcher";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/common/CountUp";
import { useInsights } from "@/hooks/useReports";
import { periodLabel, shiftPeriod, fmtDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { CategoryMover, InsightsMetric, InsightsReport, PeriodKey } from "@/lib/types";

export default function InsightsPage() {
  const { t } = useTranslation("insights");
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodKey>("month");
  const [refDate, setRefDate] = useState(new Date());

  const params = useMemo(() => ({ period, ref: refDate.toISOString() }), [period, refDate]);
  const { data, isLoading } = useInsights(params);

  const noun = t(`noun.${period}`); // "month" / "week" / "year", localized

  /** Deep-link into the period's transactions, optionally filtered. */
  function openTxns(extra: Record<string, string | undefined> = {}) {
    if (!data) return;
    const sp = new URLSearchParams({ from: data.current.start, to: data.current.end });
    for (const [k, v] of Object.entries(extra)) if (v) sp.set(k, v);
    navigate(`/transactions?${sp.toString()}`);
  }

  const highlights = useMemo(() => (data ? buildHighlights(data, t, noun) : []), [data, t, noun]);

  return (
    <div>
      <PageHeader title={t("title")} description={t("description")} />

      <PeriodSwitcher
        period={period}
        onPeriodChange={setPeriod}
        refDate={refDate}
        onShift={(dir) => setRefDate((d) => shiftPeriod(period, d, dir))}
        className="mb-2"
      />
      <p className="mb-5 text-sm text-muted-foreground">
        {t("showing")} <span className="font-medium text-foreground">{periodLabel(period, refDate)}</span>
      </p>

      {isLoading ? (
        <InsightsSkeleton />
      ) : !data || !data.hasData ? (
        <EmptyState icon={Sparkles} title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <div className="space-y-4">
          {/* auto-written highlights */}
          {highlights.length > 0 && (
            <Card className="surface-gradient">
              <CardContent className="space-y-2.5 p-5">
                {highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <h.icon className={cn("mt-0.5 h-4 w-4 shrink-0", h.tone)} />
                    <p>{h.text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* headline comparison */}
          <div className="grid gap-4 sm:grid-cols-3">
            <CompareCard label={t("compare.spending")} metric={data.expense} noun={noun} goodWhenUp={false} animId="insights-spending" />
            <CompareCard label={t("compare.income")} metric={data.income} noun={noun} goodWhenUp animId="insights-income" />
            <CompareCard label={t("compare.net")} metric={data.net} noun={noun} goodWhenUp animId="insights-net" />
          </div>

          {/* spending pace */}
          <PaceCard data={data} noun={noun} />

          <div className="grid gap-4 lg:grid-cols-2">
            {/* category movers */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  {t("movers.title")}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("movers.subtitle", { noun })}</p>
              </CardHeader>
              <CardContent>
                {data.movers.length ? (
                  <MoversList
                    movers={data.movers}
                    onSelect={(m) => openTxns({ type: "expense", category: m.categoryId ?? undefined })}
                    labelNew={t("movers.new")}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("movers.none")}</p>
                )}
              </CardContent>
            </Card>

            {/* biggest single expenses */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-muted-foreground" />
                  {t("top.title")}
                </CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">{t("top.subtitle")}</p>
              </CardHeader>
              <CardContent>
                {data.topExpenses.length ? (
                  <ul className="divide-y">
                    {data.topExpenses.map((e) => {
                      const Icon = getIcon(e.category?.icon ?? "tag");
                      const color = e.category?.color ?? "#94A3B8";
                      const primary = e.payee || e.note || (e.category ? categoryLabel(e.category.name) : t("top.untitled"));
                      return (
                        <li key={e._id} className="flex items-center gap-3 py-2.5">
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                            style={{ backgroundColor: `${color}1f`, color }}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{primary}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {e.category ? categoryLabel(e.category.name) : t("top.uncategorized")} · {fmtDate(e.date, "dd MMM")}
                            </p>
                          </div>
                          <span className="tnum shrink-0 text-sm font-semibold text-expense">
                            {formatMoney(e.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">{t("top.none")}</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

/** Big current value with a coloured change-vs-previous badge. */
function CompareCard({
  label,
  metric,
  noun,
  goodWhenUp,
  animId,
}: {
  label: string;
  metric: InsightsMetric;
  noun: string;
  goodWhenUp: boolean;
  /** Stable id so the count-up rolls once per session (see CountUp). */
  animId?: string;
}) {
  const { t } = useTranslation("insights");
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <CountUp value={metric.current} id={animId} className="tnum mt-1 block text-2xl font-bold tracking-tight" />
        <div className="mt-2 flex items-center gap-2">
          <DeltaBadge delta={metric.delta} pct={metric.pct} goodWhenUp={goodWhenUp} />
          <span className="text-xs text-muted-foreground">{t("compare.vsLast", { noun })}</span>
        </div>
        <p className="tnum mt-1 text-xs text-muted-foreground">
          {t("compare.lastWas", { amount: formatMoney(metric.previous), noun })}
        </p>
      </CardContent>
    </Card>
  );
}

/** A ▲/▼ pill: colour reflects whether the direction is good or bad for this metric. */
function DeltaBadge({ delta, pct, goodWhenUp }: { delta: number; pct: number | null; goodWhenUp: boolean }) {
  const { t } = useTranslation("insights");
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        <Minus className="h-3 w-3" /> {t("delta.flat")}
      </span>
    );
  }
  const up = delta > 0;
  const good = up === goodWhenUp;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
        good ? "bg-income/10 text-income" : "bg-expense/10 text-expense"
      )}
    >
      <Icon className="h-3 w-3" />
      {pct == null ? formatMoney(Math.abs(delta), { compact: true }) : `${Math.abs(pct)}%`}
    </span>
  );
}

function PaceCard({ data, noun }: { data: InsightsReport; noun: string }) {
  const { t } = useTranslation("insights");
  const { pace, expense } = data;
  const progress = Math.min(100, Math.round((pace.daysElapsed / pace.daysInPeriod) * 100));
  // Are we ahead of or behind last period's spend at the same point?
  const vsPrev = pace.previousToDate > 0 ? expense.current - pace.previousToDate : null;
  const vsPrevPct =
    pace.previousToDate > 0 ? Math.round(((expense.current - pace.previousToDate) / pace.previousToDate) * 100) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-muted-foreground" />
          {t("pace.title")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">{t("pace.spentSoFar")}</p>
            <CountUp value={expense.current} id="insights-pace-spent" className="tnum mt-0.5 block text-xl font-bold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t("pace.avgPerDay")}</p>
            <CountUp value={Math.round(pace.avgPerDay)} id="insights-pace-avg" className="tnum mt-0.5 block text-xl font-bold" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {pace.isCurrent ? t("pace.projected", { noun }) : t("pace.total", { noun })}
            </p>
            <CountUp value={pace.projected} id="insights-pace-projected" className="tnum mt-0.5 block text-xl font-bold text-expense" />
          </div>
        </div>

        {pace.isCurrent && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("pace.dayOf", { elapsed: pace.daysElapsed, total: pace.daysInPeriod })}</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {vsPrev != null && vsPrevPct != null && (
          <p className="mt-4 flex items-center gap-1.5 text-sm">
            {vsPrev > 0 ? (
              <TrendingUp className="h-4 w-4 text-expense" />
            ) : vsPrev < 0 ? (
              <TrendingDown className="h-4 w-4 text-income" />
            ) : (
              <Minus className="h-4 w-4 text-muted-foreground" />
            )}
            <span>
              {vsPrev === 0
                ? t("pace.samePace", { noun })
                : t(vsPrev > 0 ? "pace.fasterThan" : "pace.slowerThan", {
                    pct: Math.abs(vsPrevPct),
                    noun,
                  })}
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MoversList({
  movers,
  onSelect,
  labelNew,
}: {
  movers: CategoryMover[];
  onSelect: (m: CategoryMover) => void;
  labelNew: string;
}) {
  const maxAbs = Math.max(...movers.map((m) => Math.abs(m.delta)), 1);
  return (
    <ul className="space-y-3">
      {movers.map((m) => {
        const Icon = getIcon(m.icon);
        const up = m.delta > 0;
        const half = (Math.abs(m.delta) / maxAbs) * 50;
        return (
          <li key={m.categoryId ?? "__uncat__"}>
            <button
              type="button"
              onClick={() => onSelect(m)}
              className="w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${m.color}1f`, color: m.color }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{categoryLabel(m.name)}</span>
                <span className={cn("tnum shrink-0 text-sm font-semibold", up ? "text-expense" : "text-income")}>
                  {up ? "+" : "−"}
                  {formatMoney(Math.abs(m.delta))}
                </span>
                <span className="tnum w-12 shrink-0 text-right text-xs text-muted-foreground">
                  {m.pct == null ? labelNew : `${up ? "+" : "−"}${Math.abs(m.pct)}%`}
                </span>
              </div>
              {/* diverging bar: right = spending more, left = spending less */}
              <div className="relative mt-1.5 ml-[2.375rem] h-1.5 rounded-full bg-muted">
                <div className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-border" />
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: up ? "50%" : `${50 - half}%`,
                    width: `${half}%`,
                    backgroundColor: up ? "hsl(var(--expense))" : "hsl(var(--income))",
                  }}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function InsightsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

type Highlight = { icon: typeof Lightbulb; tone: string; text: string };

/** Compose a few plain-language takeaways from the numbers (localized). */
function buildHighlights(
  data: InsightsReport,
  t: (k: string, o?: Record<string, unknown>) => string,
  noun: string
): Highlight[] {
  const out: Highlight[] = [];

  // 1) Overall spend vs last period.
  if (data.expense.pct == null) {
    out.push({
      icon: Sparkles,
      tone: "text-primary",
      text: t("highlights.spendNoBase", { amount: formatMoney(data.expense.current), noun }),
    });
  } else {
    const up = data.expense.delta > 0;
    out.push({
      icon: up ? TrendingUp : TrendingDown,
      tone: up ? "text-expense" : "text-income",
      text: t("highlights.spend", {
        amount: formatMoney(data.expense.current),
        pct: Math.abs(data.expense.pct),
        dir: up ? t("dir.more") : t("dir.less"),
        noun,
      }),
    });
  }

  // 2) Biggest upward mover (where the extra money went).
  const topUp = data.movers.find((m) => m.delta > 0);
  if (topUp) {
    out.push({
      icon: Lightbulb,
      tone: "text-amber-500",
      text: t("highlights.mover", {
        category: categoryLabel(topUp.name),
        amount: formatMoney(topUp.delta),
        pct: topUp.pct == null ? "" : ` (${topUp.pct}%)`,
      }),
    });
  }

  // 3) Where the current period is heading.
  if (data.pace.isCurrent && data.pace.projected > 0) {
    out.push({
      icon: Gauge,
      tone: "text-primary",
      text: t("highlights.pace", { amount: formatMoney(data.pace.projected), noun }),
    });
  }

  return out.slice(0, 3);
}
