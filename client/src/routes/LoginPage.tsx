import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AuthShell } from "@/features/auth/AuthShell";
import { OAuthButtons } from "@/features/auth/OAuthButtons";
import { useLogin } from "@/hooks/useAuth";

/** Seconds → "M:SS" for the rate-limit countdown (e.g. 899 → "14:59"). */
function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function LoginPage() {
  const { t } = useTranslation("auth");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(
    params.get("error") ? t("login.oauthError") : null
  );
  // When the server rate-limits sign-in (429), it returns retryAfterSeconds. We
  // hold the target time and tick a clock so the user sees a live countdown and
  // can't hammer the button until it elapses.
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const secondsLeft = retryAt ? Math.max(0, Math.ceil((retryAt - nowTs) / 1000)) : 0;

  useEffect(() => {
    if (retryAt == null) return;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);

  useEffect(() => {
    if (retryAt != null && secondsLeft === 0) setRetryAt(null); // window elapsed — re-enable
  }, [retryAt, secondsLeft]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await login.mutateAsync({ email, password, remember });
      // 2FA-enabled accounts hand back a challenge instead of a session — go
      // finish the second step (the pending cookie is already set server-side).
      if (result.requires2fa) {
        navigate("/login/2fa", { replace: true, state: { methods: result.methods } });
        return;
      }
      navigate("/", { replace: true });
    } catch (err) {
      const e = err as Error & { retryAfterSeconds?: number };
      setError(err instanceof Error ? err.message : t("login.genericError"));
      if (typeof e.retryAfterSeconds === "number" && e.retryAfterSeconds > 0) {
        setNowTs(Date.now());
        setRetryAt(Date.now() + e.retryAfterSeconds * 1000);
      }
    }
  }

  const rateLimited = secondsLeft > 0;
  // While rate-limited, show a ticking countdown instead of the static server text.
  const displayError = rateLimited
    ? t("login.rateLimited", { time: formatCountdown(secondsLeft) })
    : error;

  return (
    <AuthShell title={t("login.title")} subtitle={t("login.subtitle")}>
      <form onSubmit={submit} className="space-y-4">
        {displayError && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{displayError}</p>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="email">{t("shared.email")}</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{t("shared.password")}</Label>
            <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
              {t("login.forgotPassword")}
            </Link>
          </div>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
            {t("login.staySignedIn")}
          </Label>
          <Switch id="remember" checked={remember} onCheckedChange={setRemember} />
        </div>
        <Button type="submit" className="w-full" disabled={login.isPending || rateLimited}>
          {rateLimited
            ? t("login.retryIn", { time: formatCountdown(secondsLeft) })
            : login.isPending
              ? t("login.submitting")
              : t("login.submit")}
        </Button>
      </form>

      <div className="mt-4">
        <OAuthButtons />
      </div>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {t("login.noAccount")}{" "}
        <Link to="/signup" className="font-medium text-primary hover:underline">
          {t("login.signUpLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
