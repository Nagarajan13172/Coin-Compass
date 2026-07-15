import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart, Sector, Tooltip } from "recharts";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import { cn } from "@/lib/utils";
import type { CategoryDatum } from "@/lib/types";

interface CategoryDonutProps {
  data: CategoryDatum[];
  total: number;
  onSelect?: (categoryId: string | null) => void;
  centerLabel?: string;
  /** Show a proportional bar under each row (turns the legend into a mini bar chart). */
  showBars?: boolean;
  /** Lay the legend out in two columns on wider screens — for full-width cards with many categories. */
  wideLegend?: boolean;
  /** When given, shows a summary strip of total earned / spent / net above the chart. */
  totals?: { income: number; expense: number };
}

/** Tooltip shown when hovering a pie slice: category name + amount + share. */
function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: CategoryDatum }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: d.color }}
        />
        <span className="text-sm font-medium">{categoryLabel(d.name)}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="tnum text-sm font-semibold">{formatMoney(d.total)}</span>
        <span className="text-xs text-muted-foreground">{d.percent}%</span>
      </div>
    </div>
  );
}

/** Shape props recharts hands the `activeShape` renderer (loosely typed by the lib). */
type SectorShapeProps = {
  cx?: number;
  cy?: number;
  innerRadius?: number;
  outerRadius?: number;
  startAngle?: number;
  endAngle?: number;
  fill?: string;
};

/** Slightly enlarged sector drawn for the hovered/active slice. */
function renderActiveSector(props: SectorShapeProps) {
  const {
    cx = 0,
    cy = 0,
    innerRadius = 0,
    outerRadius = 0,
    startAngle = 0,
    endAngle = 0,
    fill,
  } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 6}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

export function CategoryDonut({
  data,
  total,
  onSelect,
  centerLabel,
  showBars = false,
  wideLegend = false,
  totals,
}: CategoryDonutProps) {
  const { t } = useTranslation("reports");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const resolvedCenterLabel = centerLabel ?? t("centerLabel.spent");
  const max = data.reduce((m, d) => Math.max(m, d.total), 0) || 1;
  const netTotal = totals ? totals.income - totals.expense : 0;

  return (
    <div className="flex flex-col gap-4">
      {totals && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-b pb-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{t("centerLabel.earned")}</span>
            <Money amount={totals.income} type="income" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{t("centerLabel.spent")}</span>
            <Money amount={totals.expense} type="expense" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{t("net")}</span>
            <span
              className={cn(
                "tnum font-semibold",
                netTotal >= 0 ? "text-income" : "text-expense"
              )}
            >
              {formatMoney(netTotal, { signed: true })}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative h-48 w-48 shrink-0">
          <PieChart width={192} height={192}>
            <Tooltip content={<DonutTooltip />} wrapperStyle={{ outline: "none" }} />
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
              isAnimationActive
              activeIndex={activeIndex ?? undefined}
              activeShape={(props: unknown) => renderActiveSector(props as SectorShapeProps)}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.categoryId ?? d.name}
                  fill={d.color}
                  fillOpacity={activeIndex == null || activeIndex === i ? 1 : 0.4}
                  className="cursor-pointer outline-none transition-opacity"
                  onClick={() => onSelect?.(d.categoryId)}
                />
              ))}
            </Pie>
          </PieChart>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="text-xs text-muted-foreground">{resolvedCenterLabel}</span>
            <span className="tnum text-lg font-bold">
              {formatMoney(total, { compact: total > 99999 })}
            </span>
          </div>
        </div>

        <ul
          className={cn(
            "grid min-w-0 flex-1 gap-x-6 gap-y-2",
            wideLegend ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          )}
        >
          {data.map((d, i) => {
            const label = categoryLabel(d.name);
            const percent = (
              <span className="tnum shrink-0 text-xs text-muted-foreground">{d.percent}%</span>
            );
            return (
              <li key={d.categoryId ?? d.name} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSelect?.(d.categoryId)}
                  onMouseEnter={() => setActiveIndex(i)}
                  onMouseLeave={() => setActiveIndex(null)}
                  className={cn(
                    "group flex w-full min-w-0 flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    onSelect && "hover:bg-accent",
                    activeIndex === i && "bg-accent"
                  )}
                  title={onSelect ? t("viewTransactionsFor", { name: label }) : label}
                >
                  <span className="flex w-full min-w-0 items-center gap-2.5">
                    <CategoryIcon icon={d.icon} color={d.color} size="md" />
                    {/* Single line + ellipsis; the wide two-column legend gives each
                        row enough room that names rarely need truncating, and the full
                        name is always available on hover (title below). */}
                    <span className="min-w-0 flex-1 truncate text-base font-medium">{label}</span>
                    {/* Without bars the percent rides here; with bars it moves to the
                        bar row below to give the name more horizontal room. */}
                    {!showBars && percent}
                    <span className="tnum shrink-0 whitespace-nowrap text-right text-base font-semibold">
                      {formatMoney(d.total)}
                    </span>
                  </span>
                  {showBars && (
                    <span className="flex items-center gap-2.5">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full transition-all"
                          style={{ width: `${Math.max(2, (d.total / max) * 100)}%`, backgroundColor: d.color }}
                        />
                      </span>
                      {percent}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
