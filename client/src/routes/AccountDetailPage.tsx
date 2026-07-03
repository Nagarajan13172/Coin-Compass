import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRightLeft, Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CountUp } from "@/components/common/CountUp";
import { RecordMeta } from "@/components/common/RecordMeta";
import { TransactionList } from "@/features/transactions/TransactionList";
import { AccountFormDialog } from "@/features/accounts/AccountFormDialog";
import { useAccount, useDeleteAccount } from "@/hooks/useAccounts";
import { useTransactionList } from "@/hooks/useTransactions";
import { useUIStore } from "@/stores/ui";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { enumLabel } from "@/lib/i18nLabels";
import { toast } from "sonner";

export default function AccountDetailPage() {
  const { t } = useTranslation("accounts");
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: account, isLoading } = useAccount(id);
  const { data: transactions, isLoading: txnsLoading } = useTransactionList({ account: id }, 200);
  const del = useDeleteAccount();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const [editOpen, setEditOpen] = useState(false);

  async function handleDelete() {
    if (!account) return;
    if (!confirm(t("confirm.deleteDetail", { name: account.name }))) return;
    try {
      await del.mutateAsync({ id: account._id });
      toast.success(t("toast.deleted"));
      navigate("/accounts", { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("toast.failed");
      if (msg.includes("transaction") && confirm(t("confirm.deleteWithTxns", { message: msg }))) {
        await del.mutateAsync({ id: account._id, force: true });
        toast.success(t("toast.deletedWithTxns"));
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
        title={t("detail.notFoundTitle")}
        description={t("detail.notFoundDescription")}
        action={
          <Button asChild>
            <Link to="/accounts">{t("detail.backToAccounts")}</Link>
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
          <ArrowLeft /> {t("detail.back")}
        </Link>
      </Button>

      <PageHeader
        title={account.name}
        description={t("detail.typeAccount", { type: enumLabel("account", account.type) })}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => openTxnSheet({ type: "transfer" })}>
              <ArrowRightLeft /> {t("txnType.transfer", { ns: "common" })}
            </Button>
            <Button variant="outline" size="icon" aria-label={t("editAccount")} onClick={() => setEditOpen(true)}>
              <Pencil />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label={t("deleteAccount")}
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
              <p className="text-sm text-muted-foreground">{t("detail.currentBalance")}</p>
              <CountUp
                value={account.balance ?? 0}
                className={`tnum block text-3xl font-extrabold ${negative ? "text-expense" : ""}`}
              />
            </div>
          </div>
          {stats && (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t("txnType.income", { ns: "common" })} value={stats.income} tone="income" />
              <Stat label={t("txnType.expense", { ns: "common" })} value={stats.expense} tone="expense" />
              <Stat label={t("detail.transfersIn")} value={stats.transferIn} />
              <Stat label={t("detail.transfersOut")} value={stats.transferOut} />
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground tnum">
            {t("detail.openingBalance", {
              amount: formatMoney(account.initialBalance, { currency: account.currency }),
            })}
          </p>
          <RecordMeta createdAt={account.createdAt} updatedAt={account.updatedAt} className="mt-1" />
        </CardContent>
      </Card>

      {/* transactions */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("detail.transactions")}</h2>
        <Button size="sm" onClick={() => openTxnSheet({ type: "expense" })}>
          <Plus /> {t("actions.add", { ns: "common" })}
        </Button>
      </div>

      {txnsLoading ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : transactions && transactions.length > 0 ? (
        <TransactionList transactions={transactions} />
      ) : (
        <EmptyState
          icon={Receipt}
          title={t("detail.noTransactionsTitle")}
          description={t("detail.noTransactionsDescription")}
          action={
            <Button onClick={() => openTxnSheet({ type: "expense" })}>
              <Plus /> {t("actions.addTransaction", { ns: "common" })}
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
