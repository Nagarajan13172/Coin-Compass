import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { MailCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/AuthShell";
import { useMe, useVerifyEmail, useResendVerification, useLogout } from "@/hooks/useAuth";

/**
 * One route, two jobs:
 *  - With ?token=… (clicked from the email) → verify it, then drop into the app.
 *  - Without a token → the "please verify" holding screen for a signed-in but
 *    unverified user, with a resend button.
 */
export default function VerifyEmailPage() {
  const { t } = useTranslation("auth");
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();

  const { data: me, isLoading: meLoading, refetch } = useMe();
  const verify = useVerifyEmail();
  const resend = useResendVerification();
  const logout = useLogout();

  const [failed, setFailed] = useState(false);
  const [resent, setResent] = useState(false);
  const ranToken = useRef(false);

  // Verify the token exactly once on mount.
  useEffect(() => {
    if (!token || ranToken.current) return;
    ranToken.current = true;
    verify.mutateAsync(token).catch(() => setFailed(true));
  }, [token, verify]);

  // Whenever we know the email is verified (after verify, or a manual refresh),
  // head into the app.
  useEffect(() => {
    if (me?.emailVerified) navigate("/", { replace: true });
  }, [me, navigate]);

  async function handleResend() {
    setResent(false);
    try {
      await resend.mutateAsync();
      setResent(true);
    } catch {
      /* surfaced via resend.isError below */
    }
  }

  // ---- Token flow ----
  if (token) {
    if (failed) {
      return (
        <AuthShell title={t("verifyEmail.failedTitle")} subtitle={t("verifyEmail.failedSubtitle")}>
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("verifyEmail.failedBody")}
          </p>
          <div className="mt-4 space-y-2">
            {me && !me.emailVerified && (
              <Button className="w-full" onClick={handleResend} disabled={resend.isPending}>
                {resend.isPending ? t("shared.sending") : resent ? t("verifyEmail.resent") : t("verifyEmail.resendVerification")}
              </Button>
            )}
            <Button variant="outline" className="w-full" asChild>
              <Link to="/login">{t("shared.backToSignIn")}</Link>
            </Button>
          </div>
        </AuthShell>
      );
    }
    return (
      <AuthShell title={t("verifyEmail.verifyingTitle")} subtitle={t("verifyEmail.verifyingSubtitle")}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }

  // ---- Holding screen (no token) ----
  if (meLoading) {
    return (
      <AuthShell title={t("verifyEmail.loadingTitle")} subtitle={t("verifyEmail.loadingSubtitle")}>
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthShell>
    );
  }
  if (!me) return <Navigate to="/login" replace />;
  if (me.emailVerified) return <Navigate to="/" replace />;

  return (
    <AuthShell title={t("verifyEmail.title")} subtitle={t("verifyEmail.subtitle")}>
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("verifyEmail.sentLinkPrefix")}
            <span className="font-medium text-foreground">{me.email}</span>
            {t("verifyEmail.sentLinkSuffix")}
          </p>
        </div>

        {resent && (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
            {t("verifyEmail.resentBanner")}
          </p>
        )}
        {resend.isError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t("verifyEmail.sendError")}
          </p>
        )}

        <div className="space-y-2">
          <Button className="w-full" onClick={handleResend} disabled={resend.isPending}>
            {resend.isPending ? t("shared.sending") : t("verifyEmail.resendEmail")}
          </Button>
          <Button variant="outline" className="w-full" onClick={() => refetch()}>
            {t("verifyEmail.verifiedContinue")}
          </Button>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          {t("verifyEmail.wrongAccount")}{" "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => logout.mutateAsync().then(() => navigate("/login", { replace: true }))}
          >
            {t("verifyEmail.logOut")}
          </button>
        </p>
      </div>
    </AuthShell>
  );
}
