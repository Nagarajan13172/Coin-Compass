import { useTranslation } from "react-i18next";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AccountDatum } from "@/lib/types";

interface ByAccountListProps {
  data: AccountDatum[];
  onSelect?: (accountId: string) => void;
}

/** Per-account income vs expense with proportional bars and a net figure. */
export function ByAccountList({ data, onSelect }: ByAccountListProps) {
  const { t } = useTranslation("reports");
  const max = data.reduce((m, d) => Math.max(m, d.income, d.expense), 0) || 1;

  return (
    <ul className="flex flex-col divide-y">
      {data.map((a) => {
        const net = a.income - a.expense;
        return (
          <li key={a._id}>
            <button
              type="button"
              onClick={() => onSelect?.(a._id)}
              title={onSelect ? t("viewTransactionsFor", { name: a.name }) : undefined}
              className={cn(
                "flex w-full flex-col gap-2 px-2 py-3 text-left transition-colors",
                onSelect && "hover:bg-accent"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.color }} />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
                <span
                  className={cn(
                    "tnum shrink-0 text-sm font-semibold",
                    net >= 0 ? "text-income" : "text-expense"
                  )}
                >
                  {formatMoney(net, { signed: true })}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <Bar label={t("inLabel")} value={a.income} max={max} tone="income" />
                <Bar label={t("outLabel")} value={a.expense} max={max} tone="expense" />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "income" | "expense";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", tone === "income" ? "bg-income" : "bg-expense")}
          style={{ width: value > 0 ? `${Math.max(2, (value / max) * 100)}%` : 0 }}
        />
      </span>
      <span className="tnum w-24 shrink-0 whitespace-nowrap text-right text-xs text-muted-foreground">
        {formatMoney(value)}
      </span>
    </div>
  );
}
