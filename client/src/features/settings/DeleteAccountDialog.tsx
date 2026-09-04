import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useDeleteAccount } from "@/hooks/useAuth";

/**
 * Closing the account for good.
 *
 * The dialog is deliberately slow. It says what goes before asking anything,
 * offers the export first — this is the last moment the data exists — and only
 * then asks for the two proofs the server wants: the email typed out, and the
 * password. The confirm button stays dead until both are there, so it cannot be
 * reached by clicking through.
 *
 * Nothing here is recoverable, and the copy says so in those words rather than
 * "this action cannot be undone", which every dialog says and nobody reads.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  email,
  hasPassword,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  email: string;
  /** A Google-only account has no password to ask for. */
  hasPassword: boolean;
}) {
  const { t } = useTranslation("settings");
  const del = useDeleteAccount();
  const navigate = useNavigate();
  const [typedEmail, setTypedEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setTypedEmail("");
      setPassword("");
    }
  }, [open]);

  const emailMatches = typedEmail.trim().toLowerCase() === email.toLowerCase();
  const ready = emailMatches && (!hasPassword || password.length > 0);

  async function submit() {
    try {
      await del.mutateAsync({ email: typedEmail.trim(), password: password || undefined });
      onOpenChange(false);
      toast.success(t("danger.deleted"));
      navigate("/login", { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("danger.failed"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-expense">
            <AlertTriangle className="h-4 w-4" />
            {t("danger.dialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("danger.dialogSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="space-y-1.5 rounded-lg border border-expense/30 bg-expense/[0.06] p-3 text-xs leading-relaxed">
            <li>{t("danger.goesTransactions")}</li>
            <li>{t("danger.goesWealth")}</li>
            <li>{t("danger.goesPeople")}</li>
            <li className="font-medium">{t("danger.goesForever")}</li>
          </ul>

          {/* Offered before anything is asked for: this is the last moment the
              data exists, and afterwards there is nothing to export. */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3">
            <p className="text-xs text-muted-foreground">{t("danger.exportFirst")}</p>
            <Button variant="outline" size="sm" className="shrink-0" asChild>
              <a href="/api/export/csv">
                <Download /> {t("danger.exportCsv")}
              </a>
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="del-email">{t("danger.typeEmail")}</Label>
            <Input
              id="del-email"
              autoComplete="off"
              value={typedEmail}
              onChange={(e) => setTypedEmail(e.target.value)}
              placeholder={email}
            />
            {typedEmail.length > 0 && !emailMatches && (
              <p className="text-xs text-expense">{t("danger.emailMismatch")}</p>
            )}
          </div>

          {hasPassword && (
            <div className="space-y-1.5">
              <Label htmlFor="del-password">{t("danger.password")}</Label>
              <PasswordInput
                id="del-password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button variant="destructive" onClick={submit} disabled={!ready || del.isPending}>
            {del.isPending ? t("danger.deleting") : t("danger.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
