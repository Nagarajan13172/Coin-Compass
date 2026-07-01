import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/common/CountUp";
import { TransactionList } from "@/features/transactions/TransactionList";
import { AccountFormDialog } from "@/features/accounts/AccountFormDialog";
import { useAccount, useDeleteAccount } from "@/hooks/useAccounts";
import { useTransactionList } from "@/hooks/useTransactions";
import { useUIStore } from "@/stores/ui";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { accountTypeLabel } from "@/lib/accounts";
import { toast } from "sonner";

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: account, isLoading } = useAccount(id);
  const { data: transactions, isLoading: txnsLoading } = useTransactionList({ account: id }, 200);
  const del = useDeleteAccount();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    if (!account) return;
    if (!confirm(`Delete "${account.name}"? Its transactions will block deletion unless forced.`)) return;
    try {
      await del.mutateAsync({ id: account._id });
      toast.success("Account deleted");
      navigate("/accounts", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg.includes("transaction") && confirm(`${msg}\n\nDelete the account AND its transactions?`)) {
        await del.mutateAsync({ id: account._id, force: true });
        toast.success("Account and its transactions deleted");
        navigate("/accounts", { replace: true });
      } else {
        toast.error(msg);
      }
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (!account) {
    return (
      <EmptyState
        icon={Receipt}
        title="Account not found"
        description="This account may have been deleted."
        action={
          <Button asChild>
            <Link to="/accounts">Back to accounts</Link>
          </Button>
        }
      />
    );
  }

  const Icon = getIcon(account.icon);
  const stats = account.stats;
  const negative = (account.balance ?? 0) < 0;

  return (
    <div>
      <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/accounts">
          <ArrowLeft /> Accounts
        </Link>
      </Button>

      <PageHeader
        title={account.name}
        description={`${accountTypeLabel(account.type)} account`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => openTxnSheet({ type: "transfer" })}>
              <ArrowRightLeft /> Transfer
            </Button>
            <Button variant="outline" size="icon" aria-label="Edit account" onClick={() => setEditOpen(true)}>
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Delete account"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 />
            </Button>
          </div>
        }
      />

      {/* balance + stats */}
      <Card className="surface-gradient mb-5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${account.color}1f`, color: account.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm text-muted-foreground">Current balance</p>
              <CountUp
                value={account.balance ?? 0}
                className={`tnum block text-3xl font-extrabold ${negative ? "text-expense" : ""}`}
              />
            </div>
          </div>
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Income" value={stats.income} tone="income" />
              <Stat label="Expense" value={stats.expense} tone="expense" />
              <Stat label="Transfers in" value={stats.transferIn} />
              <Stat label="Transfers out" value={stats.transferOut} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground tnum">
            Opening balance {formatMoney(account.initialBalance, { currency: account.currency })}
          </p>
        </CardContent>
      </Card>

      {/* transactions */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Transactions</h2>
        <Button size="sm" onClick={() => openTxnSheet({ type: "expense" })}>
          <Plus /> Add
        </Button>
      </div>

      {txnsLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : transactions && transactions.length > 0 ? (
        <TransactionList transactions={transactions} />
      ) : (
        <EmptyState
          icon={Receipt}
          title="No transactions"
          description="Transactions on this account will show up here."
          action={
            <Button onClick={() => openTxnSheet({ type: "expense" })}>
              <Plus /> Add transaction
            </Button>
          }
        />
      )}

      <AccountFormDialog open={editOpen} onOpenChange={setEditOpen} account={account} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "income" | "expense" }) {
  return (
    <div className="rounded-lg border p-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tnum font-semibold ${tone === "income" ? "text-income" : tone === "expense" ? "text-expense" : ""}`}>
        {formatMoney(value)}
      </p>
    </div>
  );
}
