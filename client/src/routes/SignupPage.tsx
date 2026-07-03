import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/features/auth/AuthShell";
import { OAuthButtons } from "@/features/auth/OAuthButtons";
import { useSignup } from "@/hooks/useAuth";

export default function SignupPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const signup = useSignup();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError(t("shared.passwordMinLength"));
    try {
      await signup.mutateAsync({ name, email, password });
      // New accounts start unverified — send them to confirm their email.
      navigate("/verify-email", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("signup.genericError"));
    }
  }

  return (
    <AuthShell title={t("signup.title")} subtitle={t("signup.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="name">{t("labels.name", { ns: "common" })}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("labels.optional", { ns: "common" })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("shared.email")}</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">{t("shared.password")}</Label>
          <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          <p className="text-xs text-muted-foreground">{t("signup.passwordHint")}</p>
        </div>
        <Button type="submit" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? t("signup.submitting") : t("signup.submit")}
        </Button>
      </form>

      <div className="mt-4">
        <OAuthButtons />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("signup.haveAccount")}{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          {t("signup.signInLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
