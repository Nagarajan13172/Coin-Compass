import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { HeartHandshake, Link2, Link2Off, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { cn } from "@/lib/utils";
import type { Credit, CreditPersonSummary } from "@/lib/types";
import { CreditFormDialog } from "@/features/credits/CreditFormDialog";

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
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
  const { data: people, isLoading } = useCreditSummary();
  const del = useDeleteCredit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Credit | null>(null);
  const [prefillPerson, setPrefillPerson] = useState<string | undefined>();

  const totals = useMemo(() => {
    const owedToYou = (people ?? []).reduce((s, p) => s + Math.max(0, p.net), 0);
    const youOwe = (people ?? []).reduce((s, p) => s + Math.max(0, -p.net), 0);
    return { owedToYou, youOwe, net: owedToYou - youOwe };
  }, [people]);

  function openNew(person?: string) {
    setEditing(null);
    setPrefillPerson(person);
    setOpen(true);
  }
  function openEdit(c: Credit) {
    setEditing(c);
    setPrefillPerson(undefined);
    setOpen(true);
  }
  async function handleDelete(c: Credit) {
    if (!confirm(t("delete.confirm", { person: c.person }))) return;
    await del.mutateAsync(c._id);
    toast.success(t("delete.success"));
  }

  return (
    <div>
      <PageHeader
        title={t("page.title")}
        description={t("page.description")}
        actions={
          <Button onClick={() => openNew()}>
            <Plus /> {t("page.addCredit")}
          </Button>
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
            <Stat label={t("totals.owed")} tone="income" value={formatMoney(totals.owedToYou)} />
            <Stat label={t("totals.owe")} tone="expense" value={formatMoney(totals.youOwe)} />
            <Stat label={t("totals.net")} value={formatMoney(totals.net, { signed: true })} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {people.map((p) => (
              <PersonCard
                key={p.person}
                summary={p}
                onAdd={() => openNew(p.person)}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
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

      <CreditFormDialog open={open} onOpenChange={setOpen} credit={editing} defaultPerson={prefillPerson} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "tnum text-2xl font-bold",
            tone === "income" && "text-income",
            tone === "expense" && "text-expense"
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function PersonCard({
  summary,
  onAdd,
  onEdit,
  onDelete,
}: {
  summary: CreditPersonSummary;
  onAdd: () => void;
  onEdit: (c: Credit) => void;
  onDelete: (c: Credit) => void;
}) {
  const { t } = useTranslation("credits");
  const { person, net, entries } = summary;
  return (
    <Card>
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
          <EntryRow key={c._id} credit={c} onEdit={() => onEdit(c)} onDelete={() => onDelete(c)} />
        ))}
      </CardContent>
    </Card>
  );
}

function EntryRow({ credit: c, onEdit, onDelete }: { credit: Credit; onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation("credits");
  const accountName = typeof c.account === "string" ? "" : c.account?.name;
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/50">
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          c.direction === "given" ? "bg-expense/10 text-expense" : "bg-income/10 text-income"
        )}
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
        </p>
      </div>
      <span className={cn("tnum shrink-0 font-semibold", c.direction === "given" ? "text-expense" : "text-income")}>
        {c.direction === "given" ? "−" : "+"}
        {formatMoney(c.amount)}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t("entry.actions")}>
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
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
