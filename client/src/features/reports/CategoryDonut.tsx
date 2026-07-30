import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { Cell, Pie, PieChart, Sector, Tooltip } from "recharts";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { formatMoney } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import { rollupByGroup, type GroupDatum } from "@/lib/categoryGroups";
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
  /**
   * Fold rows into their category group, with each group expandable to the
   * categories inside it. Turns a ~30-row legend into ~10 readable ones.
   */
  grouped?: boolean;
}

/** A slice + legend row, in either the flat or the grouped view. */
type Slice = { key: string; name: string; color: string; total: number; percent: number };

/** Tooltip shown when hovering a pie slice: name + amount + share. */
function DonutTooltip({
  active,
  payload,
  grouped,
}: {
  active?: boolean;
  payload?: Array<{ payload: Slice }>;
  /** Group names are already translated by the rollup; category names are not. */
  grouped?: boolean;
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
        <span className="text-sm font-medium">{grouped ? d.name : categoryLabel(d.name)}</span>
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
  grouped = false,
}: CategoryDonutProps) {
  const { t } = useTranslation("reports");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const resolvedCenterLabel = centerLabel ?? t("centerLabel.spent");
  const netTotal = totals ? totals.income - totals.expense : 0;

  const groups = useMemo(() => (grouped ? rollupByGroup(data) : []), [grouped, data]);

  // One array drives both the pie and the legend, so a legend row and its slice
  // always share an index — that's what keeps the hover highlight in sync.
  const slices: Slice[] = useMemo(
    () =>
      grouped
        ? groups.map((g) => ({ key: g.key, name: g.name, color: g.color, total: g.total, percent: g.percent }))
        : data.map((d) => ({
            key: d.categoryId ?? d.name,
            name: d.name,
            color: d.color,
            total: d.total,
            percent: d.percent,
          })),
    [grouped, groups, data]
  );

  const max = slices.reduce((m, s) => Math.max(m, s.total), 0) || 1;

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

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
            <Tooltip content={<DonutTooltip grouped={grouped} />} wrapperStyle={{ outline: "none" }} />
            <Pie
              data={slices}
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
              {slices.map((s, i) => (
                <Cell
                  key={s.key}
                  fill={s.color}
                  fillOpacity={activeIndex == null || activeIndex === i ? 1 : 0.4}
                  className="cursor-pointer outline-none transition-opacity"
                  onClick={() => (grouped ? toggle(s.key) : onSelect?.(data[i].categoryId))}
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
          {grouped
            ? groups.map((g, i) => (
                <GroupRow
                  key={g.key}
                  group={g}
                  index={i}
                  max={max}
                  showBars={showBars}
                  expanded={expanded.has(g.key)}
                  active={activeIndex === i}
                  onToggle={() => toggle(g.key)}
                  onHover={setActiveIndex}
                  onSelect={onSelect}
                />
              ))
            : data.map((d, i) => (
                <li key={d.categoryId ?? d.name} className="min-w-0">
                  <LegendRow
                    label={categoryLabel(d.name)}
                    icon={d.icon}
                    color={d.color}
                    total={d.total}
                    percent={d.percent}
                    max={max}
                    showBars={showBars}
                    active={activeIndex === i}
                    clickable={Boolean(onSelect)}
                    title={
                      onSelect
                        ? t("viewTransactionsFor", { name: categoryLabel(d.name) })
                        : categoryLabel(d.name)
                    }
                    onClick={() => onSelect?.(d.categoryId)}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                  />
                </li>
              ))}
        </ul>
      </div>
    </div>
  );
}

/** A group header plus, when expanded, the categories folded into it. */
function GroupRow({
  group,
  index,
  max,
  showBars,
  expanded,
  active,
  onToggle,
  onHover,
  onSelect,
}: {
  group: GroupDatum;
  index: number;
  max: number;
  showBars: boolean;
  expanded: boolean;
  active: boolean;
  onToggle: () => void;
  onHover: (i: number | null) => void;
  onSelect?: (categoryId: string | null) => void;
}) {
  const { t } = useTranslation("reports");
  return (
    <li className="min-w-0">
      <LegendRow
        label={group.name}
        icon={group.icon}
        color={group.color}
        total={group.total}
        percent={group.percent}
        max={max}
        showBars={showBars}
        active={active}
        clickable
        expanded={expanded}
        title={t(expanded ? "collapseGroup" : "expandGroup", { name: group.name })}
        onClick={onToggle}
        onMouseEnter={() => onHover(index)}
        onMouseLeave={() => onHover(null)}
      />
      {expanded && (
        // Children hover-highlight their PARENT slice — there is no slice of
        // their own in the grouped pie.
        <ul className="ml-4 border-l pl-3">
          {group.children.map((c) => (
            <li key={c.categoryId ?? c.name} className="min-w-0">
              <LegendRow
                label={categoryLabel(c.name)}
                icon={c.icon}
                color={c.color}
                total={c.total}
                percent={c.percent}
                max={max}
                showBars={false}
                active={false}
                compact
                clickable={Boolean(onSelect)}
                title={
                  onSelect
                    ? t("viewTransactionsFor", { name: categoryLabel(c.name) })
                    : categoryLabel(c.name)
                }
                onClick={() => onSelect?.(c.categoryId)}
                onMouseEnter={() => onHover(index)}
                onMouseLeave={() => onHover(null)}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Shared legend row markup — used for flat rows, group headers, and group children. */
function LegendRow({
  label,
  icon,
  color,
  total,
  percent,
  max,
  showBars,
  active,
  clickable,
  compact = false,
  expanded,
  title,
  onClick,
  onMouseEnter,
  onMouseLeave,
}: {
  label: string;
  icon: string;
  color: string;
  total: number;
  percent: number;
  max: number;
  showBars: boolean;
  active: boolean;
  clickable: boolean;
  compact?: boolean;
  /** Present only on group headers — renders the disclosure chevron. */
  expanded?: boolean;
  title: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const percentEl = (
    <span className="tnum shrink-0 text-xs text-muted-foreground">{percent}%</span>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      aria-expanded={expanded}
      className={cn(
        "group flex w-full min-w-0 flex-col gap-1.5 rounded-lg px-2 text-left transition-colors",
        compact ? "py-1" : "py-1.5",
        clickable && "hover:bg-accent",
        active && "bg-accent"
      )}
      title={title}
    >
      <span className="flex w-full min-w-0 items-center gap-2.5">
        {expanded !== undefined && (
          <ChevronRight
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-90"
            )}
          />
        )}
        <CategoryIcon icon={icon} color={color} size={compact ? "sm" : "md"} />
        {/* Single line + ellipsis; the wide two-column legend gives each row
            enough room that names rarely need truncating, and the full name is
            always available on hover (title above). */}
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-medium",
            compact ? "text-sm text-muted-foreground" : "text-base"
          )}
        >
          {label}
        </span>
        {/* Without bars the percent rides here; with bars it moves to the bar
            row below to give the name more horizontal room. */}
        {!showBars && percentEl}
        <span
          className={cn(
            "tnum shrink-0 whitespace-nowrap text-right font-semibold",
            compact ? "text-sm" : "text-base"
          )}
        >
          {formatMoney(total)}
        </span>
      </span>
      {showBars && (
        <span className="flex items-center gap-2.5">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full transition-all"
              style={{ width: `${Math.max(2, (total / max) * 100)}%`, backgroundColor: color }}
            />
          </span>
          {percentEl}
        </span>
      )}
    </button>
  );
}
