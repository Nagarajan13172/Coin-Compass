import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OtpInput } from "@/components/ui/otp-input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/features/auth/AuthShell";
import { useVerify2fa, useSend2faEmail } from "@/hooks/useAuth";
import { useTwoFactorPending } from "@/hooks/use2fa";
import type { TwoFactorMethod } from "@/lib/types";

function FullScreenSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </div>
  );
}

export default function TwoFactorPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const location = useLocation();
  const { data: pending, isLoading } = useTwoFactorPending();
  const verify = useVerify2fa();
  const sendEmail = useSend2faEmail();

  const [method, setMethod] = useState<TwoFactorMethod>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailSent, setEmailSent] = useState(false);

  // Methods come from the server (source of truth); fall back to nav state.
  const methods = useMemo<TwoFactorMethod[]>(
    () => pending?.methods ?? (location.state as { methods?: TwoFactorMethod[] } | null)?.methods ?? ["totp"],
    [pending, location.state]
  );

  // A verified second factor means a real session now exists — go straight into
  // the app. This MUST be checked before the loading/!pending branches: a
  // successful verify clears the pending challenge, and we must not read that
  // cleared state as an expired one and bounce back to /login.
  if (verify.isSuccess) return <Navigate to="/" replace />;
  if (isLoading) return <FullScreenSplash />;
  // No valid pending challenge (expired/never started) → back to the password step.
  if (!pending) return <Navigate to="/login" replace />;

  const isBackup = method === "backup";
  const isEmail = method === "email";
  const hasEmail = methods.includes("email");

  async function verifyNow(value: string) {
    setError(null);
    try {
      await verify.mutateAsync({ method, code: value.trim() });
      // Redirect is handled declaratively via `verify.isSuccess` above, so it
      // can't lose a race with the pending-challenge query being cleared.
    } catch (err) {
      setError(err instanceof Error ? err.message : t("twoFactor.verificationFailed"));
      setCode("");
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    void verifyNow(code);
  }

  async function requestEmailCode() {
    try {
      await sendEmail.mutateAsync();
      setEmailSent(true);
      toast.success(t("twoFactor.codeSent", { email: pending!.email }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("twoFactor.sendFailed"));
    }
  }

  function switchMethod(next: TwoFactorMethod) {
    setMethod(next);
    setCode("");
    setError(null);
  }

  const title = isBackup ? t("twoFactor.titleBackup") : isEmail ? t("twoFactor.titleEmail") : t("twoFactor.titleTotp");
  const subtitle = isBackup
    ? t("twoFactor.subtitleBackup")
    : isEmail
      ? t("twoFactor.subtitleEmail", { email: pending.email })
      : t("twoFactor.subtitleTotp");

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        {isEmail && !emailSent ? (
          <Button
            type="button"
            className="w-full"
            onClick={requestEmailCode}
            disabled={sendEmail.isPending}
          >
            {sendEmail.isPending ? t("shared.sending") : t("twoFactor.emailMeCode")}
          </Button>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="code" className="sr-only">
                {isBackup ? t("twoFactor.backupCodeLabel") : t("twoFactor.verificationCodeLabel")}
              </Label>
              {isBackup ? (
                <Input
                  id="code"
                  autoFocus
                  autoComplete="one-time-code"
                  inputMode="text"
                  placeholder="xxxx-xxxx"
                  className="text-center tracking-[0.3em]"
                  value={code}
                  maxLength={12}
                  onChange={(e) => setCode(e.target.value)}
                />
              ) : (
                <OtpInput
                  value={code}
                  onChange={setCode}
                  autoFocus
                  disabled={verify.isPending}
                  invalid={!!error}
                  onComplete={verifyNow}
                  aria-label={t("twoFactor.verificationCodeLabel")}
                />
              )}
            </div>
            <Button type="submit" className="w-full" disabled={verify.isPending || code.trim().length < 6}>
              {verify.isPending ? t("twoFactor.verifying") : t("twoFactor.verify")}
            </Button>
            {isEmail && (
              <button
                type="button"
                onClick={requestEmailCode}
                disabled={sendEmail.isPending}
                className="w-full text-center text-xs font-medium text-primary hover:underline"
              >
                {t("twoFactor.resendCode")}
              </button>
            )}
          </>
        )}
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        {method !== "totp" && (
          <button
            type="button"
            onClick={() => switchMethod("totp")}
            className="font-medium text-primary hover:underline"
          >
            {t("twoFactor.useAuthenticator")}
          </button>
        )}
        {hasEmail && !isEmail && (
          <button
            type="button"
            onClick={() => switchMethod("email")}
            className="block w-full font-medium text-primary hover:underline"
          >
            {t("twoFactor.emailInstead")}
          </button>
        )}
        {!isBackup && (
          <button
            type="button"
            onClick={() => switchMethod("backup")}
            className="block w-full text-muted-foreground hover:underline"
          >
            {t("twoFactor.useBackup")}
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="font-medium text-primary hover:underline"
        >
          {t("shared.backToSignIn")}
        </button>
      </p>
    </AuthShell>
  );
}
