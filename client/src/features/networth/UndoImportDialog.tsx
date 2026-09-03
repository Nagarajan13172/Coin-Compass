import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Undo2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUndoAdoption } from "@/hooks/useHoldings";
import type { Holding } from "@/lib/types";

/**
 * Taking back an import.
 *
 * Importing rewrites real history: an expense becomes a transfer into a deposit
 * and loses the category it had. That is usually the truer reading, but the
 * candidates are partly a guess — savings-category spends and name matches — so
 * getting one wrong is easy, and without a way back the original category would
 * simply be gone.
 *
 * It restores what was there rather than merely unlinking: an instalment left as
 * an uncategorised transfer would be no more correct than one left as a spend.
 */
export function UndoImportDialog({
  holding,
  onClose,
}: {
  holding: Holding | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("wealth");
  const undo = useUndoAdoption();
  const count = holding?.paid?.imported ?? 0;

  async function submit() {
    if (!holding) return;
    try {
      const res = await undo.mutateAsync(holding._id);
      toast.success(t("undoImport.done", { count: res.restored }));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failedToSave"));
    }
  }

  return (
    <Dialog open={Boolean(holding)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-muted-foreground" />
            {t("undoImport.title")}
          </DialogTitle>
          <DialogDescription>
            {t("undoImport.subtitle", { count, name: holding?.name ?? "" })}
          </DialogDescription>
        </DialogHeader>

        <p className="rounded-lg border border-dashed px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {t("undoImport.detail")}
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={undo.isPending || count === 0}>
            {t("undoImport.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
