import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Check, Copy, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMe } from "@/hooks/useAuth";
import {
  useTwoFactorStatus,
  useSetup2fa,
  useEnable2fa,
  useDisable2fa,
  useSetEmailFallback,
  useRegenerateBackupCodes,
} from "@/hooks/use2fa";
import type { TwoFactorSetup } from "@/lib/types";

export function TwoFactorSettings() {
  const { t } = useTranslation("settings");
  const { data: me } = useMe();
  const { data: status } = useTwoFactorStatus();
  const setup = useSetup2fa();
  const enable = useEnable2fa();
  const disable = useDisable2fa();
  const setEmailFallback = useSetEmailFallback();
  const regenerate = useRegenerateBackupCodes();

  // Enrollment dialog
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollData, setEnrollData] = useState<TwoFactorSetup | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  // Shown once after enable / regenerate
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  // Disable dialog
  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  // Regenerate dialog
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenCode, setRegenCode] = useState("");

  const enabled = status?.enabled ?? false;
  const usesPassword = me?.hasPassword ?? false;

  async function startEnroll() {
    try {
      const data = await setup.mutateAsync();
      setEnrollData(data);
      setEnrollCode("");
      setEnrollOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("twoFactor.startFailed"));
    }
  }

  async function confirmEnroll(value: string = enrollCode) {
    if (!/^\d{6}$/.test(value)) return toast.error(t("twoFactor.enter6Digit"));
    try {
      const codes = await enable.mutateAsync(value);
      setEnrollOpen(false);
      setEnrollData(null);
      setBackupCodes(codes);
      toast.success(t("twoFactor.enabled"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("twoFactor.codeFailed"));
    }
  }

  async function confirmDisable() {
    if (usesPassword && !disablePassword) return toast.error(t("twoFactor.enterPassword"));
    if (!usesPassword && !disableCode) return toast.error(t("twoFactor.enterCurrentCode"));
    try {
      await disable.mutateAsync({
        currentPassword: usesPassword ? disablePassword : undefined,
        code: usesPassword ? undefined : disableCode,
      });
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      toast.success(t("twoFactor.disabled"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("twoFactor.disableFailed"));
    }
  }

  async function confirmRegenerate() {
    if (regenCode.trim().length < 6) return toast.error(t("twoFactor.enterCurrentCode"));
    try {
      const codes = await regenerate.mutateAsync(regenCode.trim());
      setRegenOpen(false);
      setRegenCode("");
      setBackupCodes(codes);
      toast.success(t("twoFactor.codesGenerated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("twoFactor.regenerateFailed"));
    }
  }

  function copyCodes() {
    if (!backupCodes) return;
    void navigator.clipboard?.writeText(backupCodes.join("\n"));
    toast.success(t("twoFactor.codesCopied"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("twoFactor.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                enabled ? "bg-income/10 text-income" : "bg-muted"
              )}
            >
              {enabled ? <ShieldCheck className="h-5 w-5" /> : <Smartphone className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-sm font-medium">{t("twoFactor.authenticatorApp")}</p>
              <p className="text-xs text-muted-foreground">
                {enabled ? t("twoFactor.descEnabled") : t("twoFactor.descDisabled")}
              </p>
            </div>
          </div>
          {enabled ? (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setDisableOpen(true)}
              disabled={disable.isPending}
            >
              <ShieldOff /> {t("buttons.disable")}
            </Button>
          ) : (
            <Switch
              checked={false}
              onCheckedChange={(v) => v && startEnroll()}
              disabled={setup.isPending}
              aria-label={t("twoFactor.enableAria")}
            />
          )}
        </div>

        {enabled && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t("twoFactor.emailFallback")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("twoFactor.emailFallbackDesc")}
                </p>
              </div>
              <Switch
                checked={status?.emailFallback ?? false}
                onCheckedChange={(v) => setEmailFallback.mutate(v)}
                aria-label={t("twoFactor.emailFallbackAria")}
              />
            </div>

            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{t("twoFactor.backupCodes")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("twoFactor.codesRemaining", { count: status?.backupCodesRemaining ?? 0 })}
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRegenOpen(true)}>
                {t("twoFactor.regenerate")}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {/* Enrollment dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("twoFactor.enrollTitle")}</DialogTitle>
            <DialogDescription>
              {t("twoFactor.enrollDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {enrollData && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={enrollData.qrDataUrl}
                  alt={t("twoFactor.qrAlt")}
                  className="h-44 w-44 rounded-lg border bg-white p-2"
                />
                <p className="text-center text-xs text-muted-foreground">
                  {t("twoFactor.manualKey")}
                  <br />
                  <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {enrollData.secret}
                  </code>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">{t("twoFactor.enter6DigitLabel")}</Label>
              <OtpInput
                value={enrollCode}
                onChange={setEnrollCode}
                disabled={enable.isPending}
                onComplete={confirmEnroll}
                aria-label={t("twoFactor.verificationCodeAria")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>
              {t("actions.cancel", { ns: "common" })}
            </Button>
            <Button onClick={() => confirmEnroll()} disabled={enable.isPending}>
              <Check /> {t("buttons.enable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup codes (shown once) */}
      <Dialog open={!!backupCodes} onOpenChange={(o) => !o && setBackupCodes(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("twoFactor.saveCodesTitle")}</DialogTitle>
            <DialogDescription>
              {t("twoFactor.saveCodesDesc")}
            </DialogDescription>
          </DialogHeader>
          {backupCodes && (
            <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 font-mono text-sm">
              {backupCodes.map((c) => (
                <span key={c} className="text-center tracking-wider">
                  {c}
                </span>
              ))}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            <Button variant="outline" onClick={copyCodes}>
              <Copy /> {t("twoFactor.copy")}
            </Button>
            <Button onClick={() => setBackupCodes(null)}>
              <Check /> {t("twoFactor.savedThem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("twoFactor.disableTitle")}</DialogTitle>
            <DialogDescription>
              {usesPassword
                ? t("twoFactor.disableDescPassword")
                : t("twoFactor.disableDescCode")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {usesPassword ? (
              <div className="space-y-1.5">
                <Label htmlFor="disable-password">{t("twoFactor.passwordLabel")}</Label>
                <PasswordInput
                  id="disable-password"
                  autoComplete="current-password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  autoFocus
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="disable-code">{t("twoFactor.authCodeLabel")}</Label>
                <Input
                  id="disable-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={12}
                  placeholder="123456"
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && confirmDisable()}
                  autoFocus
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisableOpen(false)}>
              {t("actions.cancel", { ns: "common" })}
            </Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={disable.isPending}>
              {t("buttons.disable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate backup codes dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("twoFactor.regenTitle")}</DialogTitle>
            <DialogDescription>
              {t("twoFactor.regenDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="regen-code">{t("twoFactor.authCodeLabel")}</Label>
            <Input
              id="regen-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={12}
              placeholder="123456"
              value={regenCode}
              onChange={(e) => setRegenCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmRegenerate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRegenOpen(false)}>
              {t("actions.cancel", { ns: "common" })}
            </Button>
            <Button onClick={confirmRegenerate} disabled={regenerate.isPending}>
              <Check /> {t("twoFactor.regenerate")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
