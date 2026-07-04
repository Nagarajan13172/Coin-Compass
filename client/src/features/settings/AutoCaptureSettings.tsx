import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Zap, Copy, RefreshCw, Smartphone, Info, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useAccounts } from "@/hooks/useAccounts";
import { useRegenerateIngestToken, useDisableIngestToken } from "@/hooks/useIngest";

/** "Auto (UPI account)" sentinel — Radix Select items can't hold an empty value. */
const AUTO_ACCOUNT = "__auto__";

async function copy(text: string, done: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    done();
  } catch {
    // Clipboard blocked (insecure context / permissions) — silently ignore.
  }
}

/** Settings card: turn payment auto-capture on, manage the ingest token, pick the
 *  deposit account, and show the one-time MacroDroid setup. */
export function AutoCaptureSettings() {
  const { t } = useTranslation("capture");
  const { data: settings } = useSettings();
  const { data: accounts = [] } = useAccounts();
  const updateSettings = useUpdateSettings();
  const regen = useRegenerateIngestToken();
  const disable = useDisableIngestToken();
  // The raw token is only returned once (on generate/regenerate) — hold it here to show.
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const enabled = settings?.ingestEnabled ?? false;
  const webhookUrl = `${window.location.origin}/api/ingest`;
  const bodyExample = '{"text": "You paid ₹1,000 to Blinkit"}';

  function flashCopied(field: string) {
    setCopiedField(field);
    toast.success(t("settings.copied"));
    setTimeout(() => setCopiedField((c) => (c === field ? null : c)), 1500);
  }

  async function toggle(on: boolean) {
    try {
      if (on) {
        const r = await regen.mutateAsync();
        setNewToken(r.token);
        toast.success(t("settings.statusOn"));
      } else {
        await disable.mutateAsync();
        setNewToken(null);
        toast.success(t("settings.statusOff"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  async function regenerate() {
    try {
      const r = await regen.mutateAsync();
      setNewToken(r.token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  function changeAccount(v: string) {
    updateSettings.mutate({ ingestDefaultAccount: v === AUTO_ACCOUNT ? null : v });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("settings.title")}</CardTitle>
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
              <Zap className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">
                {enabled ? t("settings.statusOn") : t("settings.statusOff")}
              </p>
              <p className="text-xs text-muted-foreground">{t("settings.description")}</p>
            </div>
          </div>
          <Switch
            checked={enabled}
            disabled={regen.isPending || disable.isPending}
            onCheckedChange={toggle}
            aria-label={t("settings.enableCta")}
          />
        </div>

        {enabled && (
          <>
            <Separator />

            {/* Token: shown in full only right after (re)generation, then just a hint. */}
            {newToken ? (
              <div className="space-y-1.5">
                <Label>{t("settings.tokenLabel")}</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-md bg-muted px-2.5 py-2 text-xs">{newToken}</code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => copy(newToken, () => flashCopied("token"))}
                  >
                    {copiedField === "token" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {t("settings.copy")}
                  </Button>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {t("settings.tokenOnce")}
                </p>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {settings?.ingestTokenHint
                    ? t("settings.tokenHint", { hint: settings.ingestTokenHint })
                    : t("settings.tokenLabel")}
                </p>
                <Button variant="outline" size="sm" onClick={regenerate} disabled={regen.isPending}>
                  <RefreshCw className="h-4 w-4" /> {t("settings.regenerate")}
                </Button>
              </div>
            )}

            {/* Which account captured payments land in */}
            <div className="space-y-1.5">
              <Label>{t("settings.defaultAccountLabel")}</Label>
              <Select
                value={settings?.ingestDefaultAccount ?? AUTO_ACCOUNT}
                onValueChange={changeAccount}
              >
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO_ACCOUNT}>{t("settings.autoAccount")}</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Webhook URL + request body — what MacroDroid POSTs to */}
            <div className="grid gap-3">
              <CopyRow
                label={t("settings.webhookLabel")}
                value={webhookUrl}
                copied={copiedField === "url"}
                onCopy={() => copy(webhookUrl, () => flashCopied("url"))}
              />
              <CopyRow
                label={t("settings.bodyLabel")}
                value={bodyExample}
                copied={copiedField === "body"}
                onCopy={() => copy(bodyExample, () => flashCopied("body"))}
              />
            </div>

            <Separator />

            {/* One-time MacroDroid setup */}
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Smartphone className="h-4 w-4" /> {t("settings.howToTitle")}
              </p>
              <p className="text-xs text-muted-foreground">{t("settings.howToIntro")}</p>
              <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
                <li>{t("settings.step1")}</li>
                <li>{t("settings.step2")}</li>
                <li>{t("settings.step3")}</li>
                <li>{t("settings.step4")}</li>
              </ol>
              <p className="text-xs font-medium text-income">{t("settings.doneNote")}</p>
            </div>
          </>
        )}

        {!enabled && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {t("settings.enableCta")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** A read-only value with a copy button (webhook URL, request body). */
function CopyRow({
  label,
  value,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate rounded-md bg-muted px-2.5 py-2 text-xs">{value}</code>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
