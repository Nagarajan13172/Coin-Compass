import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowRight, Copy, Repeat, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/common/CategoryIcon";
import { Money } from "@/components/common/Money";
import { useUIStore } from "@/stores/ui";
import { useCreateTransaction, useDeleteTransaction, useRestoreTransaction } from "@/hooks/useTransactions";
import { fmtDate } from "@/lib/dates";
import { transactionSummary } from "@/lib/format";
import { categoryLabel } from "@/lib/i18nLabels";
import type { RefLite, Transaction } from "@/lib/types";
import { cn } from "@/lib/utils";

function ref(v: RefLite | string | null | undefined): RefLite | null {
  return v && typeof v === "object" ? v : null;
}
function refId(v: RefLite | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : v._id;
}

const ACTION_W = 72;
const REVEAL = ACTION_W * 2;

/**
 * A single transaction row. Tapping opens it for editing; swiping left reveals
 * quick actions — Duplicate (log the same spend again dated today, a one-tap
 * "repeat") and Delete (with an Undo). `showDate`/`showTime` add the txn date or
 * the logged time under the amount depending on the surrounding list.
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
  const createTxn = useCreateTransaction();
  const delTxn = useDeleteTransaction();
  const restoreTxn = useRestoreTransaction();

  const account = ref(txn.account);
  const toAccount = ref(txn.toAccount);
  const category = ref(txn.category);

  const isTransfer = txn.type === "transfer";
  const title = isTransfer ? t("txnType.transfer", { ns: "common" }) : categoryLabel(category?.name);
  const icon = isTransfer ? "repeat" : category?.icon;
  const color = isTransfer ? "#3B82F6" : category?.color;

  const note = txn.note?.trim();
  const noteIsCategory = note && category?.name && note.toLowerCase() === category.name.toLowerCase();
  const detail = (note && !noteIsCategory ? note : "") || txn.payee?.trim() || "";

  // ---- swipe-to-reveal ----
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const offsetRef = useRef(0);
  const openRef = useRef(false);
  const drag = useRef({ x: 0, y: 0, dir: 0 as 0 | 1 | 2, moved: false, active: false });
  const open = offset < 0;

  function apply(v: number) {
    offsetRef.current = v;
    setOffset(v);
  }
  function setOpen(o: boolean) {
    openRef.current = o;
    apply(o ? -REVEAL : 0);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, dir: 0, moved: false, active: true };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.dir === 0) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.dir = Math.abs(dx) > Math.abs(dy) ? 1 : 2;
      if (d.dir === 1) {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        setDragging(true);
      }
    }
    if (d.dir !== 1) return; // vertical → let the page scroll
    d.moved = true;
    const base = openRef.current ? -REVEAL : 0;
    apply(Math.max(-REVEAL - 24, Math.min(0, base + dx)));
  }
  function onPointerUp() {
    const d = drag.current;
    if (d.dir === 1) setOpen(offsetRef.current < -REVEAL / 2);
    d.active = false;
    setDragging(false);
  }
  function onClick() {
    if (drag.current.moved) {
      drag.current.moved = false;
      return; // a swipe, not a tap
    }
    if (openRef.current) return setOpen(false);
    openTxnSheet({ txn });
  }

  async function duplicate() {
    setOpen(false);
    try {
      const created = (await createTxn.mutateAsync({
        type: txn.type,
        amount: txn.amount,
        account: refId(txn.account),
        toAccount: isTransfer ? refId(txn.toAccount) : null,
        category: isTransfer ? null : refId(txn.category) || null,
        note: txn.note ?? "",
        payee: txn.payee ?? "",
        tags: txn.tags ?? [],
        oneoff: txn.oneoff ?? false,
        currency: txn.currency,
        date: new Date().toISOString(),
      })) as Transaction;
      toast.success(t("toast.duplicated"), {
        description: transactionSummary(created),
        action: { label: t("actions.undo", { ns: "common" }), onClick: () => delTxn.mutate(created._id) },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.duplicateFailed"));
    }
  }

  async function remove() {
    setOpen(false);
    const description = transactionSummary(txn);
    try {
      const res = await delTxn.mutateAsync(txn._id);
      if (res?.recoverable) {
        toast.success(t("toast.deleted"), {
          description,
          action: {
            label: t("actions.undo", { ns: "common" }),
            onClick: () =>
              restoreTxn.mutate(txn._id, {
                onSuccess: () => toast.success(t("toast.restored")),
                onError: (err) => toast.error(err instanceof Error ? err.message : t("toast.restoreFailed")),
              }),
          },
        });
      } else {
        toast.success(t("toast.deleted"), { description });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.deleteFailed"));
    }
  }

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
    <div className="relative overflow-hidden rounded-lg">
      <div
        className="flex"
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? "none" : "transform 0.2s ease" }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openTxnSheet({ txn });
            }
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: "pan-y" }}
          className={cn(
            "flex w-full shrink-0 cursor-pointer select-none items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <CategoryIcon icon={icon} color={color} size="md" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium">
              <span className="truncate">{title}</span>
              {txn.recurring && (
                <Repeat className="h-3 w-3 shrink-0 text-muted-foreground" aria-label={t("row.recurringAria")} />
              )}
              {txn.oneoff && (
                <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-px text-[10px] font-medium text-amber-600 dark:text-amber-500">
                  {t("row.oneoff")}
                </span>
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
            <Money amount={txn.amount} type={txn.type} signed={!isTransfer} currency={txn.currency} className="text-sm" />
            {showDate && (
              <span className="tnum text-[11px] text-muted-foreground">{fmtDate(txn.date, "dd MMM")}</span>
            )}
            {showTime && txn.createdAt && (
              <span className="tnum text-[11px] text-muted-foreground">{fmtDate(txn.createdAt, "h:mm a")}</span>
            )}
          </div>
        </div>

        {/* swipe actions, sitting just off-screen to the right until revealed */}
        <div className="flex shrink-0" aria-hidden={!open}>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={duplicate}
            aria-label={t("swipe.duplicate")}
            style={{ width: ACTION_W }}
            className="flex flex-col items-center justify-center gap-0.5 bg-primary/15 text-[11px] font-medium text-primary transition-colors hover:bg-primary/25"
          >
            <Copy className="h-4 w-4" />
            {t("swipe.duplicate")}
          </button>
          <button
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={remove}
            aria-label={t("actions.delete", { ns: "common" })}
            style={{ width: ACTION_W }}
            className="flex flex-col items-center justify-center gap-0.5 bg-expense text-[11px] font-medium text-expense-foreground transition-colors hover:brightness-110"
          >
            <Trash2 className="h-4 w-4" />
            {t("actions.delete", { ns: "common" })}
          </button>
        </div>
      </div>
    </div>
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
