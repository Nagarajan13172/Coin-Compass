import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUIStore } from "@/stores/ui";
import { useUpdateSettings } from "@/hooks/useSettings";
import { SUPPORTED_LANGUAGES, type LanguageCode } from "@/i18n";

/** Header control to switch the UI language at any time. Applies instantly and
 *  persists the choice both on this device and on the account (so it sticks across
 *  logins and devices), mirroring how ThemeToggle remembers the theme. */
export function LanguageToggle() {
  const { t } = useTranslation("common");
  const language = useUIStore((s) => s.language);
  const setLanguage = useUIStore((s) => s.setLanguage);
  const updateSettings = useUpdateSettings();

  function choose(lang: LanguageCode) {
    if (lang === language) return;
    setLanguage(lang); // instant, and persisted to localStorage
    updateSettings.mutate({ language: lang }); // remembered on the account
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("language.label")}>
          <Languages className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map((l) => (
          <DropdownMenuItem key={l.code} onClick={() => choose(l.code)}>
            <span className="flex-1">
              {l.nativeLabel}
              {l.nativeLabel !== l.label ? ` · ${l.label}` : ""}
            </span>
            {language === l.code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
