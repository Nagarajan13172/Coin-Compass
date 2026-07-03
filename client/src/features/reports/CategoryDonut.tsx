import { useTranslation } from "react-i18next";
import { Cell, Pie, PieChart } from "recharts";
import { CategoryIcon } from "@/components/common/CategoryIcon";
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
}

export function CategoryDonut({
  data,
  total,
  onSelect,
  centerLabel,
  showBars = false,
  wideLegend = false,
}: CategoryDonutProps) {
  const { t } = useTranslation("reports");
  const resolvedCenterLabel = centerLabel ?? t("centerLabel.spent");
  const max = data.reduce((m, d) => Math.max(m, d.total), 0) || 1;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative h-48 w-48 shrink-0">
        <PieChart width={192} height={192}>
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
          >
            {data.map((d) => (
              <Cell
                key={d.categoryId ?? d.name}
                fill={d.color}
                className="cursor-pointer outline-none"
                onClick={() => onSelect?.(d.categoryId)}
              />
            ))}
          </Pie>
        </PieChart>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted-foreground">{resolvedCenterLabel}</span>
          <span className="tnum text-lg font-bold">{formatMoney(total, { compact: total > 99999 })}</span>
        </div>
      </div>

      <ul
        className={cn(
          "grid min-w-0 flex-1 gap-x-6 gap-y-2",
          wideLegend ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
        )}
      >
        {data.map((d) => {
          const label = categoryLabel(d.name);
          const percent = (
            <span className="tnum shrink-0 text-xs text-muted-foreground">{d.percent}%</span>
          );
          return (
            <li key={d.categoryId ?? d.name} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelect?.(d.categoryId)}
                className={cn(
                  "group flex w-full min-w-0 flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                  onSelect && "hover:bg-accent"
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
  );
}
