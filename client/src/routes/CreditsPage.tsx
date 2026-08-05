import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import {
  Check,
  ChevronRight,
  HeartHandshake,
  Link2,
  Link2Off,
  MoreVertical,
  Pencil,
  Plus,
  Receipt,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CountUp } from "@/components/common/CountUp";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCreditSummary, useDeleteCredit } from "@/hooks/useCredits";
import { formatMoney } from "@/lib/format";
import { enumLabel } from "@/lib/i18nLabels";
import { dateFnsLocale } from "@/lib/dates";
import { partitionCredits, directionTone, type SettledPerson } from "@/lib/credits";
import { cn } from "@/lib/utils";
import type { Credit, CreditPersonSummary } from "@/lib/types";
import { CreditFormDialog, type CreditPrefill } from "@/features/credits/CreditFormDialog";
import { SplitsSection } from "@/features/splits/SplitsSection";
import { SplitFormDialog } from "@/features/splits/SplitFormDialog";

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function refId(v: { _id: string } | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : v._id;
}

/**
 * The account the person's money last moved through, so a settle-up lands back
 * where the lend came from. Entries are newest-first, and only reflected ones
 * carry an account.
 */
function reflectedAccountId(p: CreditPersonSummary): string | undefined {
  const entry = p.entries.find((e) => e.reflected && e.account);
  if (!entry?.account) return undefined;
  return typeof entry.account === "string" ? entry.account : entry.account._id;
}

function dayLabel(d: string) {
  try {
    return format(parseISO(d), "dd MMM yyyy", { locale: dateFnsLocale() });
  } catch {
    return d;
  }
}

export default function CreditsPage() {
  const { t } = useTranslation("credits");
  const { t: tSplits } = useTranslation("splits");
  const { data: people, isLoading } = useCreditSummary();
  const del = useDeleteCredit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Credit | null>(null);
  // Held in state (not built inline) so its identity is stable — the dialog
  // re-seeds its fields whenever this reference changes.
  const [prefill, setPrefill] = useState<CreditPrefill | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Credit | null>(null);
  // Splits live here rather than in the transaction sheet: a shared bill happens a
  // handful of times a month against 100+ ordinary entries, and it settles through
  // the per-person balances on this very page.
  const [splitOpen, setSplitOpen] = useState(false);

  const totals = useMemo(() => {
    const owedToYou = (people ?? []).reduce((s, p) => s + Math.max(0, p.net), 0);
    const youOwe = (people ?? []).reduce((s, p) => s + Math.max(0, -p.net), 0);
    return { owedToYou, youOwe, net: owedToYou - youOwe };
  }, [people]);

  // People who still owe (or are owed) stay as full cards; squared-up people
  // fold into a collapsed section so the page doesn't fill with closed business.
  const { active, settled } = useMemo(() => partitionCredits(people ?? []), [people]);

  function openNew(person?: string) {
    setEditing(null);
    setPrefill(person ? { person } : undefined);
    setOpen(true);
  }
  /** Close a balance out: the exact outstanding amount, in the opposite direction. */
  function openSettle(p: CreditPersonSummary) {
    setEditing(null);
    setPrefill({
      person: p.person,
      // Carry the record through so settling lands on their existing ledger even
      // if the display name has since been changed.
      personId: p.personId,
      direction: p.net > 0 ? "received" : "given",
      amount: Math.abs(p.net),
      // Send it back to whichever account the money last moved through.
      account: reflectedAccountId(p),
    });
    setOpen(true);
  }
  /**
   * Settle ONE lend: a repayment for exactly what's left on that entry, aimed at
   * it via `settles` so it clears that row rather than the person's oldest debt.
   */
  function openSettleEntry(p: CreditPersonSummary, c: Credit) {
    setEditing(null);
    setPrefill({
      person: p.person,
      personId: p.personId,
      // Clearing a lend is money coming back; clearing a borrow is you paying out.
      direction: c.direction === "borrowed" ? "repaid" : "received",
      amount: c.outstanding ?? c.amount,
      account: refId(c.account) || reflectedAccountId(p),
      settles: c._id,
    });
    setOpen(true);
  }
  function openEdit(c: Credit) {
    setEditing(c);
    setPrefill(undefined);
    setOpen(true);
  }
  /** Settle one participant's share of a shared bill, from the Splits section. */
  function openSettlePrefill(p: CreditPrefill) {
    setEditing(null);
    setPrefill(p);
    setOpen(true);
  }
  async function confirmDelete(c: Credit) {
    try {
      await del.mutateAsync(c._id);
      toast.success(t("delete.success"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
      throw e; // keep the dialog open on failure
    }
  }

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <>
            <Button variant="outline" onClick={() => setSplitOpen(true)}>
              <Receipt /> {tSplits("form.title")}
            </Button>
            <Button onClick={() => openNew()}>
              <Plus /> {t("page.addCredit")}
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : people && people.length > 0 ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={t("totals.owed")} tone="income" amount={totals.owedToYou} animId="credits-owed" />
            <Stat label={t("totals.owe")} tone="expense" amount={totals.youOwe} animId="credits-owe" />
            <Stat label={t("totals.net")} amount={totals.net} signed animId="credits-net" />
          </div>

          {active.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {active.map((p) => (
                <PersonCard
                  key={p.person}
                  summary={p}
                  onAdd={() => openNew(p.person)}
                  onSettle={() => openSettle(p)}
                  onSettleEntry={(c) => openSettleEntry(p, c)}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                />
              ))}
            </div>
          ) : (
            // Everyone is square — say so, rather than leaving a gap above the
            // settled section.
            <p className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
              <Check className="h-4 w-4 text-income" />
              {t("settled.allSettled")}
            </p>
          )}

          {/* Shared bills sit with the per-person balances they generate, so
              settling a split is one tap from where you check who owes you. */}
          <SplitsSection onSettle={openSettlePrefill} />

          {settled.length > 0 && (
            <SettledSection
              people={settled}
              onAdd={openNew}
              onEdit={openEdit}
              onDelete={setDeleteTarget}
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={HeartHandshake}
          title={t("empty.title")}
          description={t("empty.description")}
          action={
            <Button onClick={() => openNew()}>
              <Plus /> {t("page.addCredit")}
            </Button>
          }
        />
      )}

      <CreditFormDialog open={open} onOpenChange={setOpen} credit={editing} prefill={prefill} />
      <SplitFormDialog open={splitOpen} onOpenChange={setSplitOpen} />

      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="credit"
          confirmValue={deleteTarget.person}
          onConfirm={() => confirmDelete(deleteTarget)}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  amount,
  tone,
  signed,
  animId,
}: {
  label: string;
  amount: number;
  tone?: "income" | "expense";
  /** Prefix a +/− sign — used for the net figure, which can be negative. */
  signed?: boolean;
  /** Stable id scoping the roll to once per session (see CountUp). */
  animId?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <CountUp
          value={amount}
          signed={signed}
          id={animId}
          className={cn(
            "tnum block text-2xl font-bold",
            tone === "income" && "text-income",
            tone === "expense" && "text-expense"
          )}
        />
      </CardContent>
    </Card>
  );
}

function PersonCard({
  summary,
  onAdd,
  onSettle,
  onSettleEntry,
  onEdit,
  onDelete,
}: {
  summary: CreditPersonSummary;
  /** Settle the person's whole balance in one go. */
  onSettle: () => void;
  /** Settle just one lend of theirs. */
  onSettleEntry: (c: Credit) => void;
  onAdd: () => void;
  onEdit: (c: Credit) => void;
  onDelete: (c: Credit) => void;
}) {
  const { t } = useTranslation("credits");
  const { person, net, entries } = summary;
  return (
    <Card data-testid="person-card" data-person={person}>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border">
            <AvatarFallback className="text-sm font-semibold">{initials(person)}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle as="h2" className="text-base">
              {person}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t("person.entries", { count: entries.length })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {net !== 0 && (
            <Badge variant={net > 0 ? "income" : "expense"}>
              {net > 0
                ? t("person.owesYou", { amount: formatMoney(net) })
                : t("person.youOwe", { amount: formatMoney(-net) })}
            </Badge>
          )}
          {/* Opens the normal form prefilled with the exact outstanding amount in
              the opposite direction — nothing is posted without confirming. */}
          <Button variant="outline" size="sm" onClick={onSettle}>
            <Check className="h-4 w-4" /> {t("person.settleUp")}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("person.addWith", { person })}
            onClick={onAdd}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        {entries.map((c) => (
          <EntryRow
            key={c._id}
            credit={c}
            onEdit={() => onEdit(c)}
            onDelete={() => onDelete(c)}
            onSettle={() => onSettleEntry(c)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Everyone who is square, folded into one collapsed block. Nothing is hidden
 * permanently — each person expands to their full history, and adding an entry
 * moves them back up to the active list on the next refetch.
 */
function SettledSection({
  people,
  onAdd,
  onEdit,
  onDelete,
}: {
  people: SettledPerson[];
  onAdd: (person: string) => void;
  onEdit: (c: Credit) => void;
  onDelete: (c: Credit) => void;
}) {
  const { t } = useTranslation("credits");
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl px-5 py-4 text-left transition-colors hover:bg-accent/50"
      >
        <ChevronRight
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
        />
        <Check className="h-4 w-4 shrink-0 text-income" />
        <span className="text-sm font-semibold">
          {t("settled.section", { count: people.length })}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {t(open ? "settled.collapse" : "settled.expand")}
        </span>
      </button>
      {open && (
        <CardContent className="space-y-1 pt-0">
          {people.map((p) => (
            <SettledRow key={p.person} summary={p} onAdd={() => onAdd(p.person)} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

/** One squared-up person: a compact line that expands to their entries. */
function SettledRow({
  summary,
  onAdd,
  onEdit,
  onDelete,
}: {
  summary: SettledPerson;
  onAdd: () => void;
  onEdit: (c: Credit) => void;
  onDelete: (c: Credit) => void;
}) {
  const { t } = useTranslation("credits");
  const [open, setOpen] = useState(false);
  const { person, cycled, closedOn, entries } = summary;

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-3 px-2 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-accent/50"
          title={t(open ? "settled.collapse" : "settled.expand")}
        >
          <ChevronRight
            className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <Avatar className="h-8 w-8 border opacity-70">
            <AvatarFallback className="text-xs font-semibold">{initials(person)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{person}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {t("settled.cycled", { amount: formatMoney(cycled) })}
              {closedOn && ` · ${t("settled.closedOn", { date: dayLabel(closedOn) })}`}
            </span>
          </span>
        </button>
        <Button variant="ghost" size="icon-sm" aria-label={t("person.addWith", { person })} onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {open && (
        <div className="space-y-1.5 border-t px-2 py-2">
          {entries.map((c) => (
            <EntryRow
            key={c._id}
            credit={c}
            onEdit={() => onEdit(c)}
            onDelete={() => onDelete(c)}
            // Everyone here is already square, so there is nothing left to settle.
            onSettle={() => {}}
          />
          ))}
        </div>
      )}
    </div>
  );
}

function EntryRow({
  credit: c,
  onEdit,
  onDelete,
  onSettle,
}: {
  credit: Credit;
  onEdit: () => void;
  onDelete: () => void;
  onSettle: () => void;
}) {
  const { t } = useTranslation("credits");
  const accountName = typeof c.account === "string" ? "" : c.account?.name;
  const tone = directionTone(c.direction);
  // A "debt" row is one that can still be outstanding: money you lent them, or
  // money you borrowed. The payments against those are already-moved money.
  const isLend = c.direction === "given" || c.direction === "borrowed";
  const left = c.outstanding ?? null;
  const settled = isLend && c.settled === true;
  const partly = isLend && left != null && left > 0 && left < c.amount;
  return (
    <div
      data-testid="credit-entry"
      data-direction={c.direction}
      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50"
    >
      <span
        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", tone.bubble)}
        title={c.reflected ? t("entry.reflected") : t("entry.notReflected")}
      >
        {c.reflected ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {t(`direction.${c.direction}`)}
          {c.method && (
            <span className="text-muted-foreground"> · {t("entry.via", { method: enumLabel("method", c.method) })}</span>
          )}
          {c.reflected && accountName && <span className="text-muted-foreground"> · {accountName}</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {dayLabel(c.date)}
          {c.note && ` · ${c.note}`}
          {/* How much of THIS lend is still owed, so each row can be settled on
              its own rather than only the person's whole balance. */}
          {partly && ` · ${t("entry.leftOnThis", { amount: formatMoney(left!) })}`}
        </p>
      </div>
      {settled && (
        <Badge variant="income" className="shrink-0 gap-1">
          <Check className="h-3 w-3" /> {t("entry.settled")}
        </Badge>
      )}
      <span data-amount className={cn("tnum shrink-0 font-semibold", tone.amount)}>
        {tone.sign}
        {formatMoney(c.amount)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("entry.actions")}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Settling one entry records a repayment aimed at THIS lend, so it
              clears this row rather than the oldest one. */}
          {isLend && !settled && (
            <DropdownMenuItem onClick={onSettle}>
              <Check /> {t("entry.settleThis")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onEdit}>
            <Pencil /> {t("actions.edit", { ns: "common" })}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            <Trash2 /> {t("actions.delete", { ns: "common" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
