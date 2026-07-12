import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/common/ConfirmDeleteDialog";
import { TemplateFormDialog } from "./TemplateFormDialog";
import { useTemplates, useDeleteTemplate } from "@/hooks/useTemplates";
import { useUIStore } from "@/stores/ui";
import { getIcon } from "@/lib/icons";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RefLite, Template } from "@/lib/types";

function refId(v: RefLite | string | null | undefined): string {
  if (!v) return "";
  return typeof v === "string" ? v : v._id;
}
function ref(v: RefLite | string | null | undefined): RefLite | null {
  return v && typeof v === "object" ? v : null;
}

/**
 * One-tap "quick add" chips on the Transactions page. Tapping a chip opens the
 * entry sheet pre-filled from the template (type, account, category, note, and a
 * default price) so logging a daily spend is just "tap → tweak the price → save".
 */
export function QuickAddTemplates() {
  const { t } = useTranslation("templates");
  const { data: templates, isLoading } = useTemplates();
  const del = useDeleteTemplate();
  const openTxnSheet = useUIStore((s) => s.openTxnSheet);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  /** Open the entry sheet pre-filled from the template (tap → tweak price → save). */
  function useTemplate(tpl: Template) {
    openTxnSheet({
      type: tpl.type,
      prefill: {
        account: refId(tpl.account) || undefined,
        category: refId(tpl.category) || undefined,
        amount: tpl.amount || undefined,
        note: tpl.note || undefined,
        tags: tpl.tags?.length ? tpl.tags : undefined,
      },
    });
  }

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(tpl: Template) {
    setEditing(tpl);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget._id);
      toast.success(t("toast.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.deleteFailed"));
      throw e; // keep the confirm dialog open to retry
    }
  }

  const count = templates?.length ?? 0;

  return (
    <section className="mb-4" aria-label={t("quickAdd.label")}>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("quickAdd.label")}</p>
      <div className="flex flex-wrap items-center gap-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 w-28 shrink-0 rounded-full" />)
        ) : (
          templates?.map((tpl) => {
            const cat = ref(tpl.category);
            const color = cat?.color ?? "#64748B";
            const Icon = getIcon(cat?.icon ?? "tag");
            return (
              <div
                key={tpl._id}
                className="group inline-flex shrink-0 items-center rounded-full border bg-card transition-colors hover:border-border hover:bg-accent/40"
              >
                <button
                  type="button"
                  onClick={() => useTemplate(tpl)}
                  className="flex items-center gap-1.5 rounded-l-full py-1.5 pl-2 pr-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                    style={{ backgroundColor: `${color}24`, color }}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="font-medium">{tpl.name}</span>
                  {tpl.amount > 0 && (
                    <span className="tnum text-xs text-muted-foreground">· {formatMoney(tpl.amount)}</span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={t("quickAdd.actions")}
                      className="rounded-r-full py-1.5 pl-1 pr-2 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => openEdit(tpl)}>
                      <Pencil /> {t("menu.edit")}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteTarget(tpl)}
                    >
                      <Trash2 /> {t("menu.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}

        {!isLoading && (
          <button
            type="button"
            onClick={openCreate}
            title={count === 0 ? t("quickAdd.hint") : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground transition-colors",
              "hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            {count === 0 ? t("quickAdd.createFirst") : t("quickAdd.new")}
          </button>
        )}
      </div>

      <TemplateFormDialog open={formOpen} onOpenChange={setFormOpen} template={editing} />
      {deleteTarget && (
        <ConfirmDeleteDialog
          open={!!deleteTarget}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
          itemKey="template"
          confirmValue={deleteTarget.name}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}
