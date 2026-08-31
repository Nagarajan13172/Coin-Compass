import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useMe,
  useUnlockWealth,
  useLockWealth,
  useRequestWealthReset,
  useResetWealthPasscode,
} from "@/hooks/useAuth";
import { toast } from "sonner";

/** Which face of the dialog is showing: the passcode prompt, or recovery. */
type Step = "unlock" | "reset";

/**
 * Passcode prompt that switches the current session into the wealth (superadmin)
 * view. The everyday login never sees the Net Worth section until this succeeds.
 *
 * "Forgot passcode?" flips to the recovery step: a one-time code is mailed to the
 * account address and redeemed for a new passcode. Without it the lock is a
 * one-way door, since changing the passcode itself requires being unlocked.
 */
export function WealthUnlockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("settings");
  const unlock = useUnlockWealth();
  const requestReset = useRequestWealthReset();
  const resetPasscode = useResetWealthPasscode();
  const [step, setStep] = useState<Step>("unlock");
  const [passcode, setPasscode] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  // Recovery step.
  const [maskedEmail, setMaskedEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPasscode, setNewPasscode] = useState("");
  const [confirmPasscode, setConfirmPasscode] = useState("");

  function clearAll() {
    setStep("unlock");
    setPasscode("");
    setShow(false);
    setError("");
    setMaskedEmail("");
    setCode("");
    setNewPasscode("");
    setConfirmPasscode("");
  }

  function message(err: unknown, fallback: string) {
    return err instanceof Error ? err.message : fallback;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!passcode) return;
    try {
      await unlock.mutateAsync(passcode);
      toast.success(t("wealthUnlock.unlocked"), { description: t("wealthUnlock.unlockedDesc") });
      onOpenChange(false);
      clearAll();
    } catch (err) {
      setError(message(err, t("wealthUnlock.incorrect")));
    }
  }

  /** Mail the first code and move to the recovery form (staying put if mail fails). */
  async function startReset() {
    setError("");
    try {
      setMaskedEmail(await requestReset.mutateAsync());
      setStep("reset");
    } catch (err) {
      setError(message(err, t("wealthUnlock.codeSendFailed")));
    }
  }

  async function resendCode() {
    setError("");
    try {
      setMaskedEmail(await requestReset.mutateAsync());
      setCode("");
      toast.success(t("wealthUnlock.codeResent"));
    } catch (err) {
      setError(message(err, t("wealthUnlock.codeSendFailed")));
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (newPasscode.length < 4 || newPasscode.length > 32) {
      setError(t("wealth.passcodeLength"));
      return;
    }
    if (newPasscode !== confirmPasscode) {
      setError(t("wealth.passcodeNoMatch"));
      return;
    }
    try {
      await resetPasscode.mutateAsync({ code: code.trim(), passcode: newPasscode });
      toast.success(t("wealthUnlock.passcodeReset"), { description: t("wealthUnlock.unlockedDesc") });
      onOpenChange(false);
      clearAll();
    } catch (err) {
      setError(message(err, t("wealthUnlock.resetFailed")));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) clearAll();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {step === "unlock" ? <ShieldCheck className="h-6 w-6" /> : <Mail className="h-6 w-6" />}
          </div>
          <DialogTitle className="text-center">
            {step === "unlock" ? t("wealthUnlock.title") : t("wealthUnlock.resetTitle")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === "unlock"
              ? t("wealthUnlock.description")
              : t("wealthUnlock.resetDescription", { email: maskedEmail })}
          </DialogDescription>
        </DialogHeader>

        {step === "unlock" ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wealth-passcode">{t("wealthUnlock.passcodeLabel")}</Label>
              <div className="relative">
                <Input
                  id="wealth-passcode"
                  type={show ? "text" : "password"}
                  autoFocus
                  autoComplete="off"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    setError("");
                  }}
                  className="pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={show ? t("wealthUnlock.hidePasscode") : t("wealthUnlock.showPasscode")}
                >
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button type="submit" className="w-full" disabled={!passcode || unlock.isPending}>
                <KeyRound /> {unlock.isPending ? t("wealthUnlock.unlocking") : t("wealthUnlock.unlock")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground"
                disabled={requestReset.isPending}
                onClick={startReset}
              >
                {requestReset.isPending ? t("wealthUnlock.sendingCode") : t("wealthUnlock.forgot")}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <form onSubmit={submitReset} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wealth-reset-code">{t("wealthUnlock.codeLabel")}</Label>
              <Input
                id="wealth-reset-code"
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, ""));
                  setError("");
                }}
                className="text-center text-lg tracking-[0.4em]"
                placeholder="000000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wealth-new-passcode">{t("wealthUnlock.newPasscodeLabel")}</Label>
              <Input
                id="wealth-new-passcode"
                type="password"
                autoComplete="new-password"
                value={newPasscode}
                onChange={(e) => {
                  setNewPasscode(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wealth-confirm-passcode">{t("wealth.confirmLabel")}</Label>
              <Input
                id="wealth-confirm-passcode"
                type="password"
                autoComplete="new-password"
                value={confirmPasscode}
                onChange={(e) => {
                  setConfirmPasscode(e.target.value);
                  setError("");
                }}
                placeholder="••••••••"
              />
            </div>
            {/* One error line for the whole form — a bad code and a passcode
                mismatch both land here, right above the button that triggered it. */}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button
                type="submit"
                className="w-full"
                disabled={code.length < 6 || !newPasscode || resetPasscode.isPending}
              >
                <KeyRound />{" "}
                {resetPasscode.isPending ? t("wealthUnlock.resetting") : t("wealthUnlock.resetSubmit")}
              </Button>
              <div className="flex w-full items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    setStep("unlock");
                    setError("");
                  }}
                >
                  <ArrowLeft /> {t("wealthUnlock.back")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={requestReset.isPending}
                  onClick={resendCode}
                >
                  {requestReset.isPending ? t("wealthUnlock.sendingCode") : t("wealthUnlock.resend")}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Account-menu entries for switching wealth visibility. Renders nothing when the
 * lock is off (Net Worth is always visible then). Call `onUnlock` to open the
 * passcode dialog (kept in the parent so it survives the menu closing).
 */
export function WealthLockMenuItems({ onUnlock }: { onUnlock: () => void }) {
  const { t } = useTranslation("settings");
  const { data: me } = useMe();
  const lock = useLockWealth();
  if (!me?.wealthLockEnabled) return null;

  if (me.mode === "superadmin") {
    return (
      <DropdownMenuItem
        disabled={lock.isPending}
        onClick={async () => {
          await lock.mutateAsync();
          toast.success(t("wealthMenu.hidden"));
        }}
      >
        <Lock /> {t("wealthMenu.hide")}
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      onSelect={(e) => {
        // Let the menu close first, then open the dialog on the next tick so the
        // dropdown's focus-restore doesn't fight the dialog's autofocus.
        e.preventDefault();
        onUnlock();
      }}
    >
      <ShieldCheck /> {t("wealthMenu.unlock")}
    </DropdownMenuItem>
  );
}
