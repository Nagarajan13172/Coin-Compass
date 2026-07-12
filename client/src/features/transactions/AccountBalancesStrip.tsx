import { useTranslation } from "react-i18next";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/hooks/useAccounts";
import { cn } from "@/lib/utils";
import type { Account } from "@/lib/types";

/**
 * A horizontally-scrollable strip of every account's current balance, shown on
 * the Transactions page so the running balances are visible while adding/editing
 * without hopping to Dashboard or Accounts. Balances update automatically because
 * a transaction mutation invalidates the ["accounts"] query (see invalidateMoney).
 *
 * Each chip doubles as a quick account filter — clicking one toggles it in the
 * page's account filter, mirroring the accounts dropdown above.
 */
export function AccountBalancesStrip({
  selectedIds,
  onToggle,
}: {
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const { t } = useTranslation("transactions");
  const { data: accounts, isLoading } = useAccounts();

  if (isLoading) {
    return (
      <div className="mb-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.25rem] w-36 shrink-0 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!accounts || accounts.length === 0) return null;

  return (
    <section className="mb-4" aria-label={t("balances.title")}>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("balances.title")}</p>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {accounts.map((a) => (
          <BalanceChip
            key={a._id}
            account={a}
            selected={selectedIds.includes(a._id)}
            onClick={() => onToggle(a._id)}
          />
        ))}
      </div>
    </section>
  );
}

function BalanceChip({
  account: a,
  selected,
  onClick,
}: {
  account: Account;
  selected: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation("transactions");
  const Icon = getIcon(a.icon);
  const balance = a.balance ?? 0;
  const negative = balance < 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={t("balances.chipAria", {
        account: a.name,
        amount: formatMoney(balance, { currency: a.currency }),
      })}
      className={cn(
        "group relative flex min-w-[8.5rem] shrink-0 flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-sm",
        selected ? "border-primary/50 ring-2 ring-primary/40" : "hover:border-border"
      )}
    >
      {/* same colour language as the account cards: a top accent strip in the
          account's colour plus a faint colour wash, so each account is
          recognisable at a glance and the two views feel like one system */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: a.color }} />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06] transition-opacity duration-200 group-hover:opacity-[0.1]"
        style={{ background: `radial-gradient(120% 90% at 100% 0%, ${a.color}, transparent 60%)` }}
      />
      <span className="relative flex flex-col gap-1.5 px-3 pb-2.5 pt-3">
        <span className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${a.color}1f`, color: a.color }}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-xs font-medium text-muted-foreground">{a.name}</span>
        </span>
        <span className={cn("tnum text-base font-bold leading-none", negative && "text-expense")}>
          {formatMoney(balance, { currency: a.currency })}
        </span>
      </span>
    </button>
  );
}
