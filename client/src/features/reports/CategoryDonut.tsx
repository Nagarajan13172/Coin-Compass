import { Cell, Pie, PieChart } from "recharts";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategoryDatum } from "@/lib/types";

interface CategoryDonutProps {
  data: CategoryDatum[];
  total: number;
  onSelect?: (categoryId: string | null) => void;
  centerLabel?: string;
  /** Show a proportional bar under each row (turns the legend into a mini bar chart). */
  showBars?: boolean;
}

export function CategoryDonut({
  data,
  total,
  onSelect,
  centerLabel = "Total spent",
  showBars = false,
}: CategoryDonutProps) {
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
          <span className="text-xs text-muted-foreground">{centerLabel}</span>
          <span className="tnum text-lg font-bold">{formatMoney(total, { compact: total > 99999 })}</span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.categoryId ?? d.name}>
            <button
              type="button"
              onClick={() => onSelect?.(d.categoryId)}
              className={cn(
                "group flex w-full min-w-0 flex-col gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                onSelect && "hover:bg-accent"
              )}
              title={onSelect ? `View ${d.name} transactions` : undefined}
            >
              <span className="flex w-full min-w-0 items-center gap-3">
                <CategoryIcon icon={d.icon} color={d.color} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.name}</span>
                <span className="tnum shrink-0 text-xs text-muted-foreground">{d.percent}%</span>
                <span className="tnum w-24 shrink-0 whitespace-nowrap text-right text-sm font-semibold">
                  {formatMoney(d.total)}
                </span>
              </span>
              {showBars && (
                <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-all"
                    style={{ width: `${Math.max(2, (d.total / max) * 100)}%`, backgroundColor: d.color }}
                  />
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
