import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addDays,
  addMonths,
  addYears,
  format,
  isAfter,
  setMonth,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
} from "date-fns";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { dateFnsLocale } from "@/lib/dates";

/**
 * What slice of the ledger the Transactions page is showing. A specific month is
 * the default (and the primary control); year/last-30/all/custom are the wider
 * escape hatches. Anchors are stored as ISO strings so the whole selection is
 * URL-serialisable and cheap to compare.
 */
export type PeriodSelection =
  | { kind: "month"; anchor: string } // start-of-month ISO
  | { kind: "year"; anchor: string } // start-of-year ISO
  | { kind: "last30" }
  | { kind: "all" }
  | { kind: "custom"; from: string; to: string };

/** Inclusive-from / exclusive-to range (the server filters with $gte / $lt). */
export function selectionRange(sel: PeriodSelection): { from?: string; to?: string } {
  switch (sel.kind) {
    case "month": {
      const start = startOfMonth(new Date(sel.anchor));
      return { from: start.toISOString(), to: addMonths(start, 1).toISOString() };
    }
    case "year": {
      const start = startOfYear(new Date(sel.anchor));
      return { from: start.toISOString(), to: addYears(start, 1).toISOString() };
    }
    case "last30": {
      const now = new Date();
      return {
        from: startOfDay(subDays(now, 29)).toISOString(),
        to: startOfDay(addDays(now, 1)).toISOString(),
      };
    }
    case "custom":
      return { from: sel.from, to: sel.to };
    case "all":
    default:
      return {};
  }
}

export function selectionLabel(sel: PeriodSelection, t: (k: string) => string): string {
  const locale = dateFnsLocale();
  switch (sel.kind) {
    case "month":
      return format(new Date(sel.anchor), "MMMM yyyy", { locale });
    case "year":
      return format(new Date(sel.anchor), "yyyy", { locale });
    case "last30":
      return t("period.last30");
    case "all":
      return t("period.all");
    case "custom": {
      const from = new Date(sel.from);
      const to = new Date(sel.to);
      const oneDay = to.getTime() - from.getTime() <= 25 * 3600 * 1000;
      if (oneDay) return format(from, "dd MMM yyyy", { locale });
      return `${format(from, "dd MMM", { locale })} – ${format(new Date(to.getTime() - 1), "dd MMM yyyy", { locale })}`;
    }
  }
}

/** Serialise a selection to URL params (only the identifying keys). */
export function selectionToParams(sel: PeriodSelection): Record<string, string> {
  switch (sel.kind) {
    case "month":
      return { month: format(new Date(sel.anchor), "yyyy-MM") };
    case "year":
      return { year: format(new Date(sel.anchor), "yyyy") };
    case "last30":
      return { period: "30d" };
    case "all":
      return { period: "all" };
    case "custom":
      return { from: sel.from, to: sel.to };
  }
}

export const thisMonth = (): PeriodSelection => ({
  kind: "month",
  anchor: startOfMonth(new Date()).toISOString(),
});

/** The chevrons step months (month view) or years (year view); other modes don't step. */
function stepUnit(sel: PeriodSelection): "month" | "year" | null {
  if (sel.kind === "month") return "month";
  if (sel.kind === "year") return "year";
  return null;
}

interface PeriodNavigatorProps {
  value: PeriodSelection;
  onChange: (sel: PeriodSelection) => void;
}

/**
 * The Transactions period control: a `‹ July 2026 ›` month stepper whose label
 * opens a month/year picker, with wider ranges (This year, Last 30 days, All
 * time) tucked into the same popover. Stepping through months covers "last
 * month, the month before, …" without a growing dropdown.
 */
export function PeriodNavigator({ value, onChange }: PeriodNavigatorProps) {
  const { t } = useTranslation("transactions");
  const [open, setOpen] = useState(false);
  const unit = stepUnit(value);

  function step(dir: number) {
    if (value.kind === "month") {
      onChange({ kind: "month", anchor: addMonths(new Date(value.anchor), dir).toISOString() });
    } else if (value.kind === "year") {
      onChange({ kind: "year", anchor: addYears(new Date(value.anchor), dir).toISOString() });
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={!unit}
        onClick={() => step(-1)}
        aria-label={t("nav.previous")}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="h-9 min-w-[8.5rem] flex-1 justify-center gap-1.5 font-medium sm:flex-none">
            <Calendar className="h-4 w-4 opacity-60" />
            <span className="truncate">{selectionLabel(value, t)}</span>
            <ChevronDown className="h-3.5 w-3.5 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <MonthPicker
            value={value}
            onPick={(sel) => {
              onChange(sel);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <Button
        variant="outline"
        size="icon"
        className="h-9 w-9 shrink-0"
        disabled={!unit}
        onClick={() => step(1)}
        aria-label={t("nav.next")}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Year stepper + 12-month grid, plus quick range options. */
function MonthPicker({
  value,
  onPick,
}: {
  value: PeriodSelection;
  onPick: (sel: PeriodSelection) => void;
}) {
  const { t } = useTranslation("transactions");
  const locale = dateFnsLocale();
  const now = new Date();

  // The year the grid is showing. Track the selected month/year when relevant so
  // reopening the picker lands on it; otherwise start at the current year.
  const initialYear =
    value.kind === "month" || value.kind === "year"
      ? new Date(value.anchor).getFullYear()
      : now.getFullYear();
  const [gridYear, setGridYear] = useState(initialYear);

  const selectedMonth =
    value.kind === "month" ? new Date(value.anchor) : null;

  const months = Array.from({ length: 12 }, (_, m) => setMonth(startOfMonth(new Date(gridYear, 0, 1)), m));

  return (
    <div className="space-y-3">
      {/* year stepper */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGridYear((y) => y - 1)} aria-label={t("nav.previousYear")}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          type="button"
          onClick={() => onPick({ kind: "year", anchor: startOfYear(new Date(gridYear, 0, 1)).toISOString() })}
          className="rounded px-2 py-0.5 text-sm font-semibold hover:bg-accent"
        >
          {gridYear}
        </button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGridYear((y) => y + 1)} aria-label={t("nav.nextYear")}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* month grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {months.map((m) => {
          const isSelected =
            selectedMonth &&
            selectedMonth.getFullYear() === m.getFullYear() &&
            selectedMonth.getMonth() === m.getMonth();
          const isFuture = isAfter(startOfMonth(m), startOfMonth(now));
          const isCurrent = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
          return (
            <button
              key={m.getMonth()}
              type="button"
              onClick={() => onPick({ kind: "month", anchor: m.toISOString() })}
              className={cn(
                "rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent",
                !isSelected && isCurrent && "ring-1 ring-primary/40",
                !isSelected && isFuture && "text-muted-foreground/60"
              )}
            >
              {format(m, "MMM", { locale })}
            </button>
          );
        })}
      </div>

      {/* quick ranges */}
      <div className="flex flex-wrap gap-1.5 border-t pt-3">
        <QuickChip label={t("period.thisMonth")} active={value.kind === "month"} onClick={() => onPick(thisMonth())} />
        <QuickChip
          label={t("period.thisYear")}
          active={value.kind === "year"}
          onClick={() => onPick({ kind: "year", anchor: startOfYear(now).toISOString() })}
        />
        <QuickChip label={t("period.last30")} active={value.kind === "last30"} onClick={() => onPick({ kind: "last30" })} />
        <QuickChip label={t("period.all")} active={value.kind === "all"} onClick={() => onPick({ kind: "all" })} />
      </div>
    </div>
  );
}

function QuickChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
      )}
    >
      {label}
    </button>
  );
}
