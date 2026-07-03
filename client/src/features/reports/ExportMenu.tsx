import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, format, parseISO } from "date-fns";
import { CalendarRange, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface ExportMenuProps {
  /** Current period range (ISO, end exclusive-ish) used for the "this period" export. */
  range: { from: string; to: string };
  /** Human label for the current period, e.g. "July 2026". */
  periodLabel: string;
}

function csvUrl(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return `/api/export/csv${qs ? `?${qs}` : ""}`;
}

/** Export CSV control: this period, all time, or a custom date range. */
export function ExportMenu({ range, periodLabel }: ExportMenuProps) {
  const { t } = useTranslation("reports");
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(() => format(parseISO(range.from), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(parseISO(range.to), "yyyy-MM-dd"));

  const validCustom = from && to && from <= to;
  // `to` is inclusive in the picker; the API end is exclusive, so add a day.
  const customUrl = validCustom
    ? csvUrl(parseISO(from).toISOString(), addDays(parseISO(to), 1).toISOString())
    : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Download /> {t("export.button")}
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="border-b p-3">
          <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">{t("export.downloadTransactions")}</p>
          <a
            href={csvUrl(range.from, range.to)}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
          >
            <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">
              {t("export.thisPeriod")}
              <span className="block truncate text-xs text-muted-foreground">{periodLabel}</span>
            </span>
          </a>
          <a
            href={csvUrl()}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-accent"
          >
            <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">{t("export.allTransactions")}</span>
          </a>
        </div>

        <div className="space-y-2 p-3">
          <p className="px-1 text-xs font-medium text-muted-foreground">{t("export.customRange")}</p>
          <div className="flex items-center gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="export-from" className="text-[11px] text-muted-foreground">{t("labels.from", { ns: "common" })}</Label>
              <Input
                id="export-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label htmlFor="export-to" className="text-[11px] text-muted-foreground">{t("labels.to", { ns: "common" })}</Label>
              <Input
                id="export-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          <Button asChild={!!customUrl} className="w-full" disabled={!customUrl}>
            {customUrl ? (
              <a href={customUrl} onClick={() => setOpen(false)}>
                <Download /> {t("export.exportRange")}
              </a>
            ) : (
              <span>
                <Download /> {t("export.exportRange")}
              </span>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
