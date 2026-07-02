import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  if (isLoading) return <FullScreenSplash />;
  // No valid pending challenge (expired/never started) → back to the password step.
  if (!pending) return <Navigate to="/login" replace />;

  const isBackup = method === "backup";
  const isEmail = method === "email";
  const hasEmail = methods.includes("email");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await verify.mutateAsync({ method, code: code.trim() });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
  }

  async function requestEmailCode() {
    try {
      await sendEmail.mutateAsync();
      setEmailSent(true);
      toast.success(`Code sent to ${pending!.email}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send a code");
    }
  }

  function switchMethod(next: TwoFactorMethod) {
    setMethod(next);
    setCode("");
    setError(null);
  }

  const title = isBackup ? "Enter a backup code" : isEmail ? "Check your email" : "Two-step verification";
  const subtitle = isBackup
    ? "Use one of the one-time recovery codes you saved."
    : isEmail
      ? `We can email a one-time code to ${pending.email}.`
      : "Enter the 6-digit code from your authenticator app.";

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
            {sendEmail.isPending ? "Sending…" : "Email me a code"}
          </Button>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="code">{isBackup ? "Backup code" : "Verification code"}</Label>
              <Input
                id="code"
                autoFocus
                autoComplete="one-time-code"
                inputMode={isBackup ? "text" : "numeric"}
                placeholder={isBackup ? "xxxx-xxxx" : "123456"}
                value={code}
                maxLength={isBackup ? 12 : 6}
                onChange={(e) =>
                  setCode(isBackup ? e.target.value : e.target.value.replace(/\D/g, ""))
                }
              />
            </div>
            <Button type="submit" className="w-full" disabled={verify.isPending || code.trim().length < 6}>
              {verify.isPending ? "Verifying…" : "Verify"}
            </Button>
            {isEmail && (
              <button
                type="button"
                onClick={requestEmailCode}
                disabled={sendEmail.isPending}
                className="w-full text-center text-xs font-medium text-primary hover:underline"
              >
                Resend code
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
            Use your authenticator app
          </button>
        )}
        {hasEmail && !isEmail && (
          <button
            type="button"
            onClick={() => switchMethod("email")}
            className="block w-full font-medium text-primary hover:underline"
          >
            Email me a code instead
          </button>
        )}
        {!isBackup && (
          <button
            type="button"
            onClick={() => switchMethod("backup")}
            className="block w-full text-muted-foreground hover:underline"
          >
            Use a backup code
          </button>
        )}
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <button
          type="button"
          onClick={() => navigate("/login", { replace: true })}
          className="font-medium text-primary hover:underline"
        >
          Back to sign in
        </button>
      </p>
    </AuthShell>
  );
}
