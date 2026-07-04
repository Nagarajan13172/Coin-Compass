import { useTranslation } from "react-i18next";
import { ArrowRight, Repeat } from "lucide-react";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { useUIStore } from "@/stores/ui";
import { fmtDate } from "@/lib/dates";
import { categoryLabel } from "@/lib/i18nLabels";
import type { RefLite, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

function ref(v: RefLite | string | null | undefined): RefLite | null {
  return v && typeof v === "object" ? v : null;
}

/**
 * A single transaction row. `showDate` adds the txn date under the amount — used
 * in ungrouped lists (e.g. the dashboard "Recent" card); the Transactions page
 * groups by day, so it leaves it off. `showTime` adds the time the entry was
 * logged (its `createdAt`), used on the day-grouped Transactions page — the txn
 * `date` itself carries no time-of-day (it's stored at midnight).
 */
export function TransactionRow({
  txn,
  showDate = false,
  showTime = false,
}: {
  txn: Transaction;
  showDate?: boolean;
  showTime?: boolean;
}) {
  const { t } = useTranslation("transactions");
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const account = ref(txn.account);
  const toAccount = ref(txn.toAccount);
  const category = ref(txn.category);

  const isTransfer = txn.type === "transfer";
  const title = isTransfer ? t("txnType.transfer", { ns: "common" }) : categoryLabel(category?.name);
  const icon = isTransfer ? "repeat" : category?.icon;
  const color = isTransfer ? "#3B82F6" : category?.color;

  // A free-text detail for the row — the note (unless it just echoes the category,
  // which would render the category twice), otherwise the payee.
  const note = txn.note?.trim();
  const noteIsCategory = note && category?.name && note.toLowerCase() === category.name.toLowerCase();
  const detail = (note && !noteIsCategory ? note : "") || txn.payee?.trim() || "";

  // Every row surfaces its account so multi-account books stay legible at a glance.
  const subtitle = isTransfer ? (
    <span className="flex items-center gap-1 truncate">
      <AccountBadge name={account?.name} />
      <ArrowRight className="h-3 w-3 shrink-0" />
      <AccountBadge name={toAccount?.name} />
    </span>
  ) : (
    <span className="flex min-w-0 items-center gap-1.5 truncate">
      <AccountBadge name={account?.name} />
      {detail && <span className="truncate">{detail}</span>}
    </span>
  );

  return (
    <button
      type="button"
      onClick={() => openTxnSheet({ txn })}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent"
      )}
    >
      <CategoryIcon icon={icon} color={color} size="md" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-medium">
          <span className="truncate">{title}</span>
          {txn.recurring && (
            <Repeat
              className="h-3 w-3 shrink-0 text-muted-foreground"
              aria-label={t("row.recurringAria")}
            />
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        {txn.tags && txn.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {txn.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-secondary px-1.5 py-px text-[10px] font-medium text-secondary-foreground"
              >
                #{tag}
              </span>
            ))}
            {txn.tags.length > 3 && (
              <span className="text-[10px] text-muted-foreground">+{txn.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end">
        {/* Transfers move money between accounts — show a neutral amount, no +/− sign. */}
        <Money
          amount={txn.amount}
          type={txn.type}
          signed={!isTransfer}
          currency={txn.currency}
          className="text-sm"
        />
        {showDate && (
          <span className="tnum text-[11px] text-muted-foreground">{fmtDate(txn.date, "dd MMM")}</span>
        )}
        {showTime && txn.createdAt && (
          <span className="tnum text-[11px] text-muted-foreground">{fmtDate(txn.createdAt, "h:mm a")}</span>
        )}
      </div>
    </button>
  );
}

/** Small muted chip identifying which account a transaction belongs to. */
function AccountBadge({ name }: { name?: string }) {
  if (!name) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded bg-secondary px-1.5 py-px text-[11px] font-medium text-secondary-foreground">
      {name}
    </span>
  );
}
