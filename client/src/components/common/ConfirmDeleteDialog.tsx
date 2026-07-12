import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** The entity nouns the dialog can name; resolved from the `confirmDelete` catalog. */
export type DeleteItemKey =
  | "transaction"
  | "account"
  | "category"
  | "goal"
  | "loan"
  | "holding"
  | "credit"
  | "budget"
  | "recurring"
  | "template";

/** Returned by onConfirm when the server reports the item still has dependents and
 *  the caller wants a second, explicit "delete anyway" step (e.g. an account that
 *  still has transactions, or a category still in use). */
export type ForceResult = { needsForce: true; message: string };

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  itemKey,
  confirmValue,
  onConfirm,
  onForceConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemKey: DeleteItemKey;
  /** The identifying value shown so the user can see what they're deleting (e.g. the amount, or the name). */
  confirmValue: string;
  /** Runs the delete. Return a ForceResult to escalate to the "delete anyway" step. */
  onConfirm: () => Promise<void | ForceResult>;
  /** Runs the forced delete after the user confirms the second step. */
  onForceConfirm?: () => Promise<void>;
}) {
  const { t } = useTranslation("confirmDelete");
  const [stage, setStage] = useState<"confirm" | "force">("confirm");
  const [forceMsg, setForceMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Reset every time the dialog (re)opens so a previous attempt never leaks in.
  useEffect(() => {
    if (open) {
      setStage("confirm");
      setForceMsg("");
      setBusy(false);
    }
  }, [open]);

  const item = t(`nouns.${itemKey}`);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await onConfirm();
      if (res && "needsForce" in res && res.needsForce) {
        setForceMsg(res.message);
        setStage("force");
        setBusy(false);
        return;
      }
      onOpenChange(false);
    } catch {
      // The caller surfaces its own error toast; keep the dialog open to retry.
      setBusy(false);
    }
  }

  async function handleForce() {
    if (!onForceConfirm || busy) return;
    setBusy(true);
    try {
      await onForceConfirm();
      onOpenChange(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {t("title", { item })}
          </DialogTitle>
          <DialogDescription>{t("prompt", { item })}</DialogDescription>
        </DialogHeader>

        {stage === "confirm" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("instruction")}</p>
            <div className="select-all break-all rounded-md border bg-muted px-3 py-2 font-mono text-sm font-semibold">
              {confirmValue}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            {forceMsg}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          {stage === "confirm" ? (
            <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
              {t("confirm")}
            </Button>
          ) : (
            <Button variant="destructive" onClick={handleForce} disabled={busy}>
              {t("forceConfirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
