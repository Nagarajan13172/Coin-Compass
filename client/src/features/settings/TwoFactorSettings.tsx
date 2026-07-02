import { useState } from "react";
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
      toast.error(e instanceof Error ? e.message : "Couldn't start setup");
    }
  }

  async function confirmEnroll(value: string = enrollCode) {
    if (!/^\d{6}$/.test(value)) return toast.error("Enter the 6-digit code");
    try {
      const codes = await enable.mutateAsync(value);
      setEnrollOpen(false);
      setEnrollData(null);
      setBackupCodes(codes);
      toast.success("Two-factor authentication enabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That code didn't work");
    }
  }

  async function confirmDisable() {
    if (usesPassword && !disablePassword) return toast.error("Enter your password");
    if (!usesPassword && !disableCode) return toast.error("Enter a current code");
    try {
      await disable.mutateAsync({
        currentPassword: usesPassword ? disablePassword : undefined,
        code: usesPassword ? undefined : disableCode,
      });
      setDisableOpen(false);
      setDisablePassword("");
      setDisableCode("");
      toast.success("Two-factor authentication disabled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't disable 2FA");
    }
  }

  async function confirmRegenerate() {
    if (regenCode.trim().length < 6) return toast.error("Enter a current code");
    try {
      const codes = await regenerate.mutateAsync(regenCode.trim());
      setRegenOpen(false);
      setRegenCode("");
      setBackupCodes(codes);
      toast.success("New backup codes generated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't regenerate codes");
    }
  }

  function copyCodes() {
    if (!backupCodes) return;
    void navigator.clipboard?.writeText(backupCodes.join("\n"));
    toast.success("Backup codes copied");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
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
              <p className="text-sm font-medium">Authenticator app</p>
              <p className="text-xs text-muted-foreground">
                {enabled
                  ? "A code from your authenticator app is required at sign-in."
                  : "Require a one-time code from an authenticator app when you sign in."}
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
              <ShieldOff /> Disable
            </Button>
          ) : (
            <Switch
              checked={false}
              onCheckedChange={(v) => v && startEnroll()}
              disabled={setup.isPending}
              aria-label="Enable two-factor authentication"
            />
          )}
        </div>

        {enabled && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Email fallback</p>
                <p className="text-xs text-muted-foreground">
                  Also allow a code emailed to you if you lose your authenticator.
                </p>
              </div>
              <Switch
                checked={status?.emailFallback ?? false}
                onCheckedChange={(v) => setEmailFallback.mutate(v)}
                aria-label="Email fallback"
              />
            </div>

            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Backup codes</p>
                <p className="text-xs text-muted-foreground">
                  {status?.backupCodesRemaining ?? 0} unused code
                  {(status?.backupCodesRemaining ?? 0) === 1 ? "" : "s"} remaining.
                </p>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={() => setRegenOpen(true)}>
                Regenerate
              </Button>
            </div>
          </>
        )}
      </CardContent>

      {/* Enrollment dialog */}
      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Set up authenticator</DialogTitle>
            <DialogDescription>
              Scan this QR code with Google Authenticator, Authy, or a similar app, then enter the
              6-digit code it shows.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {enrollData && (
              <div className="flex flex-col items-center gap-3">
                <img
                  src={enrollData.qrDataUrl}
                  alt="Authenticator QR code"
                  className="h-44 w-44 rounded-lg border bg-white p-2"
                />
                <p className="text-center text-xs text-muted-foreground">
                  Can't scan? Enter this key manually:
                  <br />
                  <code className="mt-1 inline-block break-all rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {enrollData.secret}
                  </code>
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label className="text-sm">Enter the 6-digit code</Label>
              <OtpInput
                value={enrollCode}
                onChange={setEnrollCode}
                disabled={enable.isPending}
                onComplete={confirmEnroll}
                aria-label="Verification code"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnrollOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => confirmEnroll()} disabled={enable.isPending}>
              <Check /> Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Backup codes (shown once) */}
      <Dialog open={!!backupCodes} onOpenChange={(o) => !o && setBackupCodes(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Save your backup codes</DialogTitle>
            <DialogDescription>
              Each code works once. Store them somewhere safe — they're the only way in if you lose
              your authenticator. They won't be shown again.
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
              <Copy /> Copy
            </Button>
            <Button onClick={() => setBackupCodes(null)}>
              <Check /> I've saved them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disable dialog */}
      <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Disable two-factor authentication</DialogTitle>
            <DialogDescription>
              {usesPassword
                ? "Confirm your password to turn off 2FA."
                : "Enter a current authenticator or backup code to turn off 2FA."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {usesPassword ? (
              <div className="space-y-1.5">
                <Label htmlFor="disable-password">Password</Label>
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
                <Label htmlFor="disable-code">Authentication code</Label>
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
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDisable} disabled={disable.isPending}>
              Disable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Regenerate backup codes dialog */}
      <Dialog open={regenOpen} onOpenChange={setRegenOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Regenerate backup codes</DialogTitle>
            <DialogDescription>
              This invalidates your old codes. Enter a current authenticator or backup code to
              continue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="regen-code">Authentication code</Label>
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
              Cancel
            </Button>
            <Button onClick={confirmRegenerate} disabled={regenerate.isPending}>
              <Check /> Regenerate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
