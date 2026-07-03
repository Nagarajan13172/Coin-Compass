import { Check, Monitor, Moon, Sun } from "lucide-react";
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
import type { Settings } from "@/lib/types";

const OPTIONS = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { t } = useTranslation("misc");
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const updateSettings = useUpdateSettings();

  function choose(t: Settings["theme"]) {
    setTheme(t); // instant, local
    updateSettings.mutate({ theme: t }); // remembered per account
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("theme.appearance")}>
          <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("theme.appearance")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ value, icon: Icon }) => (
          <DropdownMenuItem key={value} onClick={() => choose(value)}>
            <Icon className="mr-2 h-4 w-4" />
            <span className="flex-1">{t(`theme.${value}`)}</span>
            {theme === value && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
