import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog, type ForceResult } from "@/components/common/ConfirmDeleteDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { enumLabel } from "@/lib/i18nLabels";
import { CountUp } from "@/components/common/CountUp";
import { useAccounts, useDeleteAccount } from "@/hooks/useAccounts";
import { useCanSeeWealth } from "@/hooks/useAuth";
import { useUIStore } from "@/stores/ui";
import { AccountFormDialog } from "@/features/accounts/AccountFormDialog";
import type { Account } from "@/lib/types";
import { toast } from "sonner";

export default function AccountsPage() {
  const { t } = useTranslation("accounts");
  const { data: accounts, isLoading } = useAccounts();
  const del = useDeleteAccount();
  const canSeeWealth = useCanSeeWealth();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null);

  const included = accounts?.filter((a) => a.includeInTotal) ?? [];
  const total = included.reduce((s, a) => s + (a.balance ?? 0), 0);
  const assets = included.reduce((s, a) => s + Math.max(a.balance ?? 0, 0), 0);
  const owed = included.reduce((s, a) => s + Math.max(-(a.balance ?? 0), 0), 0);
  // Relative-size strip: each included account's share of the total absolute balance.
  const absTotal = included.reduce((s, a) => s + Math.abs(a.balance ?? 0), 0);
  const alloc =
    absTotal > 0
      ? included
          .filter((a) => Math.abs(a.balance ?? 0) > 0)
          .map((a) => ({ ...a, pct: (Math.abs(a.balance ?? 0) / absTotal) * 100 }))
          .sort((x, y) => y.pct - x.pct)
      : [];

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setDialogOpen(true);
  }

  async function confirmDelete(a: Account): Promise<void | ForceResult> {
    try {
      await del.mutateAsync({ id: a._id });
      toast.success(t("toast.deleted"));
    } catch (e) {
      const err = e as Error & { code?: string };
      // The account still has transactions — escalate to the "delete anyway" step
      // (the message is already localized by the API layer).
      if (err.code === "ACCOUNT_HAS_TRANSACTIONS") return { needsForce: true, message: err.message };
      toast.error(err.message || t("toast.failed"));
      throw e;
    }
  }

  async function forceDelete(a: Account) {
    try {
      await del.mutateAsync({ id: a._id, force: true });
      toast.success(t("toast.deletedWithTxns"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
      throw e;
    }
  }

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <Button onClick={openNew}>
            <Plus /> {t("newAccount")}
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <>
          {/* Total balance equals net worth (sum of included accounts), so it is
              hidden in the everyday view when the wealth lock is engaged. */}
          {canSeeWealth && (
            <Card className="surface-gradient mb-5 overflow-hidden">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Wallet className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="text-sm text-muted-foreground">{t("totalBalance")}</p>
                      <CountUp value={total} className="tnum block text-3xl font-extrabold tracking-tight" />
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("across", { count: included.length })}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <HeroStat label={t("assets")} value={assets} tone="income" />
                    {owed > 0 && <HeroStat label={t("owed")} value={owed} tone="expense" />}
                  </div>
                </div>

                {alloc.length > 1 && (
                  <div className="mt-5 flex h-2 overflow-hidden rounded-full bg-muted">
                    {alloc.map((a) => (
                      <div
                        key={a._id}
                        title={`${a.name} · ${formatMoney(a.balance ?? 0, { currency: a.currency })}`}
                        style={{ width: `${a.pct}%`, backgroundColor: a.color }}
                        className="transition-[width] duration-500"
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a, i) => (
              <motion.div
                key={a._id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
              >
                <AccountCard
                  account={a}
                  onEdit={() => openEdit(a)}
                  onTransfer={() => openTxnSheet({ type: "transfer" })}
                  onDelete={() => setDeleteTarget(a)}
                />
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Wallet}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button onClick={openNew}>
              <Plus /> {t("newAccount")}
            </Button>
          }
        />
      )}

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="account"
          confirmValue={deleteTarget.name}
          onConfirm={() => confirmDelete(deleteTarget)}
          onForceConfirm={() => forceDelete(deleteTarget)}
        />
      )}
    </div>
  );
}

function AccountCard({
  account: a,
  onEdit,
  onTransfer,
  onDelete,
}: {
  account: Account;
  onEdit: () => void;
  onTransfer: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("accounts");
  const Icon = getIcon(a.icon);
  const balance = a.balance ?? 0;
  const negative = balance < 0;
  const stats = a.stats;
  const inflow = (stats?.income ?? 0) + (stats?.transferIn ?? 0);
  const outflow = (stats?.expense ?? 0) + (stats?.transferOut ?? 0);
  const flow = inflow + outflow;
  // Net movement since the account was opened (balance − opening balance).
  const delta = balance - a.initialBalance;

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      {/* subtle wash tinted with the account colour so cards feel less flat */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] transition-opacity duration-200 group-hover:opacity-[0.09]"
        style={{ background: `radial-gradient(130% 90% at 100% 0%, ${a.color}, transparent 55%)` }}
      />
      <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: a.color }} />

      <CardContent className="relative flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${a.color}1f`, color: a.color }}
          >
            <Icon className="h-5 w-5" />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("accountActions")}>
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil /> {t("actions.edit", { ns: "common" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onTransfer}>
                <ArrowRightLeft /> {t("txnType.transfer", { ns: "common" })}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 /> {t("actions.delete", { ns: "common" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link
          to={`/accounts/${a._id}`}
          className="mt-4 block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <p className="truncate font-semibold group-hover:underline">{a.name}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-normal">
              {enumLabel("account", a.type)}
            </Badge>
            {!a.includeInTotal && (
              <Badge variant="outline" className="font-normal text-muted-foreground">
                {t("notInTotal")}
              </Badge>
            )}
          </div>
          <p className={`tnum mt-3 text-2xl font-bold ${negative ? "text-expense" : ""}`}>
            {formatMoney(balance, { currency: a.currency })}
          </p>
          {delta !== 0 && (
            <p
              className={`tnum mt-1 flex items-center gap-1 text-xs font-medium ${
                delta > 0 ? "text-income" : "text-expense"
              }`}
            >
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {t("sinceOpening", {
                amount: formatMoney(Math.abs(delta), { currency: a.currency, compact: true }),
              })}
            </p>
          )}
        </Link>

        {/* money in vs out over the account's lifetime */}
        <div className="mt-auto space-y-2 border-t pt-4">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
            <div style={{ width: `${flow > 0 ? (inflow / flow) * 100 : 0}%`, backgroundColor: "hsl(var(--income))" }} />
            <div style={{ width: `${flow > 0 ? (outflow / flow) * 100 : 0}%`, backgroundColor: "hsl(var(--expense))" }} />
          </div>
          <div className="flex items-start justify-between text-xs">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("flow.in")}</p>
              <span className="tnum flex items-center gap-1 font-semibold text-income">
                <ArrowDownLeft className="h-3 w-3" />
                {formatMoney(inflow, { currency: a.currency, compact: true })}
              </span>
            </div>
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("flow.out")}</p>
              <span className="tnum flex items-center justify-end gap-1 font-semibold text-expense">
                <ArrowUpRight className="h-3 w-3" />
                {formatMoney(outflow, { currency: a.currency, compact: true })}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: number; tone: "income" | "expense" }) {
  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2 backdrop-blur-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`tnum font-semibold ${tone === "income" ? "text-income" : "text-expense"}`}>
        {formatMoney(value)}
      </p>
    </div>
  );
}
