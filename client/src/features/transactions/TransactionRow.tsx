import { ArrowRight } from "lucide-react";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { useUIStore } from "@/stores/ui";
import type { RefLite, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

function ref(v: RefLite | string | null | undefined): RefLite | null {
  return v && typeof v === "object" ? v : null;
}

export function TransactionRow({ txn }: { txn: Transaction }) {
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const account = ref(txn.account);
  const toAccount = ref(txn.toAccount);
  const category = ref(txn.category);

  const isTransfer = txn.type === "transfer";
  const title = isTransfer ? "Transfer" : category?.name ?? "Uncategorized";
  const icon = isTransfer ? "repeat" : category?.icon;
  const color = isTransfer ? "#3B82F6" : category?.color;

  const subtitle = isTransfer ? (
    <span className="flex items-center gap-1">
      {account?.name} <ArrowRight className="h-3 w-3" /> {toAccount?.name}
    </span>
  ) : (
    <span>{txn.note?.trim() ? txn.note : account?.name}</span>
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
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Money amount={txn.amount} type={txn.type} signed currency={txn.currency} className="text-sm" />
    </button>
  );
}
