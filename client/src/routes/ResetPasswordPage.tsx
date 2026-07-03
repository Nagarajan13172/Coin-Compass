import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/features/auth/AuthShell";
import { useResetPassword } from "@/hooks/useAuth";

export default function ResetPasswordPage() {
  const { t } = useTranslation("auth");
  const [params] = useSearchParams();
  const token = params.get("token");
  const navigate = useNavigate();
  const resetPassword = useResetPassword();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!token) return <Navigate to="/forgot-password" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("shared.passwordMinLength"));
    if (password !== confirm) return setError(t("resetPassword.passwordsMismatch"));
    try {
      await resetPassword.mutateAsync({ token: token!, password });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("resetPassword.genericError"));
    }
  }

  return (
    <AuthShell title={t("resetPassword.title")} subtitle={t("resetPassword.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("resetPassword.newPassword")}</Label>
          <PasswordInput
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">{t("resetPassword.confirmPassword")}</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={resetPassword.isPending}>
          {resetPassword.isPending ? t("resetPassword.submitting") : t("resetPassword.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("shared.backToSignIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
