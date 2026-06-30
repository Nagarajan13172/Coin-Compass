import { useState } from "react";
import { motion } from "motion/react";
import { ArrowRightLeft, MoreVertical, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { CountUp } from "@/components/common/CountUp";
import { useAccounts, useDeleteAccount } from "@/hooks/useAccounts";
import { useUIStore } from "@/stores/ui";
import { AccountFormDialog } from "@/features/accounts/AccountFormDialog";
import type { Account } from "@/lib/types";
import { toast } from "sonner";

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts();
  const del = useDeleteAccount();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  const total = accounts?.filter((a) => a.includeInTotal).reduce((s, a) => s + (a.balance ?? 0), 0) ?? 0;

  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(a: Account) {
    setEditing(a);
    setDialogOpen(true);
  }

  async function handleDelete(a: Account) {
    if (!confirm(`Delete "${a.name}"? Transactions on it will block deletion unless forced.`)) return;
    try {
      await del.mutateAsync({ id: a._id });
      toast.success("Account deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      if (msg.includes("transaction")) {
        if (confirm(`${msg}\n\nDelete the account AND its transactions?`)) {
          await del.mutateAsync({ id: a._id, force: true });
          toast.success("Account and its transactions deleted");
        }
      } else {
        toast.error(msg);
      }
    }
  }

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Cash, bank, cards & wallets"
        actions={
          <Button onClick={openNew}>
            <Plus /> New account
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : accounts && accounts.length > 0 ? (
        <>
          <Card className="surface-gradient mb-5">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total balance</p>
              <CountUp value={total} className="tnum text-3xl font-extrabold" />
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a, i) => {
              const Icon = getIcon(a.icon);
              const negative = (a.balance ?? 0) < 0;
              return (
                <motion.div
                  key={a._id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <Card className="group relative overflow-hidden">
                    <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: a.color }} />
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <span
                          className="flex h-11 w-11 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${a.color}1f`, color: a.color }}
                        >
                          <Icon className="h-5 w-5" />
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="Account actions">
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(a)}>
                              <Pencil /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openTxnSheet({ type: "transfer" })}>
                              <ArrowRightLeft /> Transfer
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => handleDelete(a)}
                            >
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <p className="mt-4 truncate font-semibold">{a.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">{a.type}</p>
                      <p
                        className={`tnum mt-2 text-2xl font-bold ${negative ? "text-expense" : ""}`}
                      >
                        {formatMoney(a.balance ?? 0, { currency: a.currency })}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Create an account to start tracking your money."
          action={
            <Button onClick={openNew}>
              <Plus /> New account
            </Button>
          }
        />
      )}

      <AccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} account={editing} />
    </div>
  );
}
