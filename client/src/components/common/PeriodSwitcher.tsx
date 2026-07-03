import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { periodLabel } from "@/lib/dates";
import type { PeriodKey } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PeriodSwitcherProps {
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  refDate: Date;
  onShift: (dir: number) => void;
  className?: string;
}

export function PeriodSwitcher({
  period,
  onPeriodChange,
  refDate,
  onShift,
  className,
}: PeriodSwitcherProps) {
  const { t } = useTranslation("misc");
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Tabs value={period} onValueChange={(v) => onPeriodChange(v as PeriodKey)}>
        <TabsList className="h-9">
          <TabsTrigger value="week">{t("period.week")}</TabsTrigger>
          <TabsTrigger value="month">{t("period.month")}</TabsTrigger>
          <TabsTrigger value="year">{t("period.year")}</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-1 rounded-lg border bg-card px-1">
        <Button variant="ghost" size="icon-sm" onClick={() => onShift(-1)} aria-label={t("period.previous")}>
          <ChevronLeft />
        </Button>
        <span className="min-w-[8.5rem] text-center text-sm font-medium tabular-nums">
          {periodLabel(period, refDate)}
        </span>
        <Button variant="ghost" size="icon-sm" onClick={() => onShift(1)} aria-label={t("period.next")}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
