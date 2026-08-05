import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users, X } from "lucide-react";
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
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import {
  usePersonGroups,
  useCreatePersonGroup,
  useUpdatePersonGroup,
  useDeletePersonGroup,
} from "@/hooks/usePersonGroups";
import { PersonPicker, type PersonSelection } from "./PersonPicker";
import type { PersonGroup } from "@/lib/types";

/**
 * Groups of people you split with regularly — "Flatmates", "Goa trip".
 *
 * A group is only a shortcut: picking one in a split adds its members as
 * ordinary participants. No balance is ever held against a group, so editing or
 * deleting one can't move money — which is why there's no force-delete step here
 * the way there is for a person.
 */
export function GroupsSection() {
  const { t } = useTranslation("people");
  const { data: groups } = usePersonGroups();
  const del = useDeletePersonGroup();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PersonGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PersonGroup | null>(null);

  async function confirmDelete(g: PersonGroup) {
    try {
      await del.mutateAsync(g._id);
      toast.success(t("groups.deleted", { name: g.name }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
      throw e; // keep the dialog open to retry
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          {t("groups.title")}
        </CardTitle>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus /> {t("groups.add")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("groups.description")}</p>

        {groups?.length ? (
          <div className="divide-y rounded-lg border">
            {groups.map((g) => (
              <div key={g._id} className="flex items-start gap-3 p-3" data-testid="person-group">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{g.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {g.members.length ? (
                      g.members.map((m) => (
                        <Badge key={m._id} variant="secondary" className="font-normal">
                          {m.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("groups.noMembers")}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("groups.editAria", { name: g.name })}
                    onClick={() => {
                      setEditing(g);
                      setFormOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("groups.deleteAria", { name: g.name })}
                    onClick={() => setDeleteTarget(g)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            {t("groups.empty")}
          </p>
        )}
      </CardContent>

      <GroupFormDialog open={formOpen} onOpenChange={setFormOpen} group={editing} />

      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="group"
          confirmValue={deleteTarget.name}
          onConfirm={() => confirmDelete(deleteTarget)}
        />
      )}
    </Card>
  );
}

function GroupFormDialog({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: PersonGroup | null;
}) {
  const { t } = useTranslation("people");
  const create = useCreatePersonGroup();
  const update = useUpdatePersonGroup();

  const [name, setName] = useState("");
  const [members, setMembers] = useState<PersonSelection[]>([]);
  const [draft, setDraft] = useState<PersonSelection>({ name: "", personId: null });

  // Keyed on `open` alone — a members list must never be cleared by an unrelated
  // query resolving while the dialog is on screen.
  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? "");
    setMembers((group?.members ?? []).map((m) => ({ name: m.name, personId: m._id })));
    setDraft({ name: "", personId: null });
  }, [open, group]);

  function addDraft(sel: PersonSelection) {
    setDraft({ name: "", personId: null });
    if (!sel.name.trim()) return;
    // Skip anyone already listed, by id where we have one and by name otherwise.
    const dupe = members.some((m) =>
      sel.personId ? m.personId === sel.personId : m.name.trim().toLowerCase() === sel.name.trim().toLowerCase()
    );
    if (dupe) return;
    setMembers((prev) => [...prev, sel]);
  }

  async function submit() {
    if (!name.trim()) return toast.error(t("groups.nameRequired"));
    const payload = {
      name: name.trim(),
      members: members.map((m) => (m.personId ? { personId: m.personId } : { name: m.name.trim() })),
    };
    try {
      if (group) {
        await update.mutateAsync({ id: group._id, ...payload });
        toast.success(t("groups.updated"));
      } else {
        await create.mutateAsync(payload);
        toast.success(t("groups.added"));
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.saveFailed"));
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{group ? t("groups.editTitle") : t("groups.addTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">{t("groups.name")}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("groups.namePlaceholder")}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t("groups.members")}</Label>
            {members.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {members.map((m, i) => (
                  <Badge key={`${m.personId ?? m.name}-${i}`} variant="secondary" className="gap-1 font-normal">
                    {m.name}
                    <button
                      type="button"
                      aria-label={t("groups.removeMember", { name: m.name })}
                      onClick={() => setMembers((prev) => prev.filter((_, j) => j !== i))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {/* Picking someone adds them straight away and resets, so several
                people can be added without reopening anything. */}
            <PersonPicker value={draft} onChange={addDraft} placeholder={t("groups.addMember")} />
            <p className="text-xs text-muted-foreground">{t("groups.membersHelp")}</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {group ? t("actions.save", { ns: "common" }) : t("actions.add", { ns: "common" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
