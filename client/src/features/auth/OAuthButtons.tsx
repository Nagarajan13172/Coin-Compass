import { Github } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useOAuthProviders } from "@/hooks/useAuth";
import type { OAuthProviders } from "@/lib/types";

const LABELS: Record<keyof OAuthProviders, string> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
  apple: "Apple",
};

/** Full-page redirects to the server's OAuth start endpoint (cookie-based flow). */
export function OAuthButtons() {
  const { t } = useTranslation("auth");
  const { data: providers } = useOAuthProviders();
  const enabled = (Object.keys(LABELS) as (keyof OAuthProviders)[]).filter((p) => providers?.[p]);
  if (enabled.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">{t("oauth.continueWith")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid gap-2">
        {enabled.map((p) => (
          <Button key={p} asChild variant="outline" className="w-full">
            <a href={`/api/auth/oauth/${p}`}>
              {p === "github" && <Github className="h-4 w-4" />}
              {LABELS[p]}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}
