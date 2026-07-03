import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/features/auth/AuthShell";
import { useForgotPassword } from "@/hooks/useAuth";

export default function ForgotPasswordPage() {
  const { t } = useTranslation("auth");
  const forgotPassword = useForgotPassword();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await forgotPassword.mutateAsync(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("forgotPassword.genericError"));
    }
  }

  if (sent) {
    return (
      <AuthShell title={t("forgotPassword.sentTitle")} subtitle={t("forgotPassword.sentSubtitle")}>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t("forgotPassword.sentBodyPrefix")}
            <span className="font-medium text-foreground">{email}</span>
            {t("forgotPassword.sentBodySuffix")}
          </p>
        </div>
        <Button variant="outline" className="mt-6 w-full" asChild>
          <Link to="/login">{t("shared.backToSignIn")}</Link>
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("forgotPassword.title")} subtitle={t("forgotPassword.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("shared.email")}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <Button type="submit" className="w-full" disabled={forgotPassword.isPending}>
          {forgotPassword.isPending ? t("shared.sending") : t("forgotPassword.submit")}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("forgotPassword.remembered")}{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("shared.backToSignIn")}
        </Link>
      </p>
    </AuthShell>
  );
}
