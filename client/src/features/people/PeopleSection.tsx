import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { GitMerge, Pencil, Plus, Trash2, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ConfirmDeleteDialog, type ForceResult } from "@/components/common/ConfirmDeleteDialog";
import { usePeople, useCreatePerson, useUpdatePerson, useDeletePerson, useMergePeople } from "@/hooks/usePeople";
import { useCreditSummary } from "@/hooks/useCredits";
import { enumLabel } from "@/lib/i18nLabels";
import { likelyDuplicates } from "@/lib/people";
import { formatMoney } from "@/lib/format";
import { PERSON_RELATIONS, type Person, type PersonRelation } from "@/lib/types";

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Manage the people credits and splits are recorded against.
 *
 * Renaming here re-labels every past entry at once (identity lives on the record,
 * not on the typed name), and merging is the repair tool for duplicates that the
 * old free-text names left behind — including any the backfill created, since it
 * can't safely guess that "Ravi" and "Ravi Kumar" are one person.
 */
export function PeopleSection() {
  const { t } = useTranslation("people");
  const { data: people } = usePeople();
  const { data: summary } = useCreditSummary();
  const create = useCreatePerson();
  const update = useUpdatePerson();
  const del = useDeletePerson();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null);
  const [mergeSource, setMergeSource] = useState<Person | null>(null);

  // Net per person, so the list shows who actually owes what.
  const netById = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of summary ?? []) if (s.personId) map.set(s.personId, s.net);
    return map;
  }, [summary]);

  const dupes = useMemo(() => likelyDuplicates(people ?? []), [people]);

  async function confirmDelete(p: Person, force = false): Promise<void | ForceResult> {
    try {
      await del.mutateAsync({ id: p._id, force });
      toast.success(t("toast.deleted", { name: p.name }));
    } catch (e) {
      const err = e as { code?: string; message?: string };
      // Still has entries → escalate to the explicit "delete anyway" step.
      if (!force && err.code === "PERSON_IN_USE") {
        return { needsForce: true, message: err.message ?? t("delete.inUse") };
      }
      toast.error(err.message ?? t("toast.saveFailed"));
      throw e; // keep the dialog open so the user can retry
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("section.title")}
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus /> {t("section.add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("section.description")}</p>

        {dupes.length > 0 && (
          <div className="rounded-lg border border-dashed border-amber-500/50 bg-amber-500/5 p-3 text-sm">
            <p className="font-medium">{t("section.dupeTitle")}</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {dupes.map(([a, b]) => (
                <li key={`${a._id}-${b._id}`}>
                  {t("section.dupeLine", { a: a.name, b: b.name })}
                </li>
              ))}
            </ul>
          </div>
        )}

        {people?.length ? (
          <div className="divide-y rounded-lg border">
            {people.map((p) => {
              const net = netById.get(p._id) ?? 0;
              return (
                <div key={p._id} className="flex items-center gap-3 p-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{enumLabel("relation", p.relation)}</p>
                  </div>
                  {net !== 0 && (
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {net > 0
                        ? t("section.owesYou", { amount: formatMoney(Math.abs(net)) })
                        : t("section.youOwe", { amount: formatMoney(Math.abs(net)) })}
                    </Badge>
                  )}
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("section.mergeAria", { name: p.name })}
                      onClick={() => setMergeSource(p)}
                      disabled={(people?.length ?? 0) < 2}
                    >
                      <GitMerge className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("section.editAria", { name: p.name })}
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("section.deleteAria", { name: p.name })}
                      onClick={() => setDeleteTarget(p)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t("section.empty")}
          </p>
        )}
      </CardContent>

      <PersonFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        person={editing}
        onSubmit={async (data) => {
          if (editing) {
            await update.mutateAsync({ id: editing._id, ...data });
            toast.success(t("toast.updated"));
          } else {
            await create.mutateAsync(data);
            toast.success(t("toast.added"));
          }
        }}
      />

      {mergeSource && (
        <MergeDialog
          source={mergeSource}
          people={(people ?? []).filter((p) => p._id !== mergeSource._id)}
          onOpenChange={(o) => !o && setMergeSource(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="person"
          confirmValue={deleteTarget.name}
          onConfirm={() => confirmDelete(deleteTarget)}
          onForceConfirm={async () => {
            await confirmDelete(deleteTarget, true);
          }}
        />
      )}
    </Card>
  );
}

function PersonFormDialog({
  open,
  onOpenChange,
  person,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  person: Person | null;
  onSubmit: (data: { name: string; relation: PersonRelation }) => Promise<void>;
}) {
  const { t } = useTranslation("people");
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<PersonRelation>("other");
  const [busy, setBusy] = useState(false);

  // Seed from the record being edited each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(person?.name ?? "");
    setRelation(person?.relation ?? "other");
  }, [open, person]);

  async function submit() {
    if (!name.trim()) return toast.error(t("form.nameRequired"));
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), relation });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{person ? t("form.editTitle") : t("form.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="person-name">{t("form.name")}</Label>
            <Input
              id="person-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              autoFocus
            />
            {person && <p className="text-xs text-muted-foreground">{t("form.renameHelp")}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>{t("form.relation")}</Label>
            <Select value={relation} onValueChange={(v) => setRelation(v as PersonRelation)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERSON_RELATIONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {enumLabel("relation", r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {person ? t("actions.save", { ns: "common" }) : t("actions.add", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Fold one person into another — every entry moves, no amount changes. */
function MergeDialog({
  source,
  people,
  onOpenChange,
}: {
  source: Person;
  people: Person[];
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("people");
  const merge = useMergePeople();
  const [target, setTarget] = useState("");

  async function submit() {
    if (!target) return toast.error(t("merge.pickTarget"));
    try {
      const res = await merge.mutateAsync({ id: source._id, into: target });
      toast.success(t("merge.done", { count: res.movedEntries, name: res.merged?.name ?? "" }));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("merge.title", { name: source.name })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("merge.help", { name: source.name })}</p>
          <div className="space-y-1.5">
            <Label>{t("merge.into")}</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={t("merge.pickTarget")} />
              </SelectTrigger>
              <SelectContent>
                {people.map((p) => (
                  <SelectItem key={p._id} value={p._id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={merge.isPending || !target}>
            {t("merge.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
