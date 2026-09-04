import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Database,
  Download,
  HandCoins,
  Info,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  Monitor,
  Moon,
  LogOut,
  Shapes,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trophy,
  Upload,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { SUPPORTED_LANGUAGES, isSupportedLanguage } from "@/i18n";
import { useUIStore } from "@/stores/ui";
import {
  useDisablePin,
  useSetPin,
  useSettings,
  useUpdateSettings,
  useSetWealthPasscode,
  useDisableWealthPasscode,
} from "@/hooks/useSettings";
import { useMe, useChangePassword, useLogout } from "@/hooks/useAuth";
import { WealthUnlockDialog } from "@/features/settings/WealthLock";
import { SettingsNav, SettingsSection } from "@/features/settings/SettingsNav";
import { TwoFactorSettings } from "@/features/settings/TwoFactorSettings";
import { useSendReportEmail } from "@/hooks/useReports";
import { useImportFile } from "@/hooks/useImport";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { dateFnsLocale } from "@/lib/dates";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useGoals } from "@/hooks/useGoals";
import { useLoans } from "@/hooks/useLoans";
import { PeopleSection } from "@/features/people/PeopleSection";
import { GroupsSection } from "@/features/people/GroupsSection";
import { APP_VERSION } from "@/lib/appInfo";
import type { ImportResult } from "@/lib/types";


/** The page's bands, in the order they appear. Drives the nav and the anchors. */
const SECTIONS = [
  { id: "account", Icon: UserRound },
  { id: "preferences", Icon: SlidersHorizontal },
  { id: "security", Icon: ShieldCheck },
  { id: "people", Icon: Users },
  { id: "data", Icon: Database },
] as const;

/**
 * How amounts are grouped. The setting exists in the model and reaches
 * formatMoney through the UI store; it simply had no control, so ₹6,62,584 could
 * never become ₹662,584.
 *
 * Only two, and named for what they do rather than for a locale code. Dates are
 * not affected — they follow the app's language — so the label says "number".
 */
const NUMBER_FORMATS = [
  { locale: "en-IN", key: "indian" },
  { locale: "en-US", key: "western" },
] as const;

export default function SettingsPage() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const sendReport = useSendReportEmail();

  async function sendTestReport() {
    try {
      const r = await sendReport.mutateAsync("midmonth");
      toast.success(ts("reports.sentTo", { email: r.sentTo }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ts("reports.sendFailed"));
    }
  }
  const setPinMut = useSetPin();
  const disablePin = useDisablePin();
  const { data: me } = useMe();
  const { data: accounts } = useAccounts();
  const { data: categories } = useCategories();
  const { data: goals } = useGoals();
  const { data: loans } = useLoans();
  const setWealthPass = useSetWealthPasscode();
  const disableWealthPass = useDisableWealthPasscode();
  const changePassword = useChangePassword();
  const logout = useLogout();
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const setLanguage = useUIStore((s) => s.setLanguage);
  const { t } = useTranslation();
  const { t: ts } = useTranslation("settings");

  const importFile = useImportFile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinMode, setPinMode] = useState<"set" | "change">("set");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [wealthDialogOpen, setWealthDialogOpen] = useState(false);
  const [wealthMode, setWealthMode] = useState<"set" | "change">("set");
  const [wealthPass, setWealthPassInput] = useState("");
  const [wealthConfirm, setWealthConfirm] = useState("");
  const [wealthUnlockOpen, setWealthUnlockOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  useEffect(() => {
    if (settings) {
      setName(settings.name);
      setDescription(settings.description ?? "");
    }
  }, [settings]);

  const profileDirty =
    !!settings && (name.trim() !== settings.name || description.trim() !== (settings.description ?? ""));

  async function saveProfile() {
    if (!name.trim()) return toast.error(ts("wallet.nameEmpty"));
    await updateSettings.mutateAsync({ name: name.trim(), description: description.trim() });
    toast.success(ts("wallet.profileUpdated"));
  }

  async function signOut() {
    await logout.mutateAsync();
    navigate("/login", { replace: true });
  }

  async function changeNumberFormat(locale: string) {
    await updateSettings.mutateAsync({ locale });
    toast.success(ts("preferences.numberFormatUpdated"));
  }

  async function changeCurrency(code: string) {
    await updateSettings.mutateAsync({ baseCurrency: code });
    toast.success(ts("preferences.currencyUpdated"));
  }

  async function changeLanguage(lang: string) {
    if (!isSupportedLanguage(lang)) return;
    setLanguage(lang); // apply instantly on this device…
    await updateSettings.mutateAsync({ language: lang }); // …and remember it on the account
    toast.success(t("language.updated"));
  }

  function openPinDialog(mode: "set" | "change") {
    setPinMode(mode);
    setPin("");
    setPinConfirm("");
    setPinDialogOpen(true);
  }

  async function togglePin(enabled: boolean) {
    if (enabled) openPinDialog("set");
    else {
      await disablePin.mutateAsync();
      toast.success(ts("pin.lockDisabled"));
    }
  }

  async function confirmPin() {
    if (!/^\d{4,8}$/.test(pin)) return toast.error(ts("pin.mustBeDigits"));
    if (pin !== pinConfirm) return toast.error(ts("pin.noMatch"));
    await setPinMut.mutateAsync(pin);
    setPinDialogOpen(false);
    toast.success(pinMode === "change" ? ts("pin.changed") : ts("pin.lockEnabled"));
  }

  function openWealthDialog(mode: "set" | "change") {
    setWealthMode(mode);
    setWealthPassInput("");
    setWealthConfirm("");
    setWealthDialogOpen(true);
  }

  async function toggleWealthLock(enabled: boolean) {
    if (enabled) openWealthDialog("set");
    else {
      await disableWealthPass.mutateAsync();
      toast.success(ts("wealth.lockDisabled"), {
        description: ts("wealth.lockDisabledDesc"),
      });
    }
  }

  async function confirmWealthPasscode() {
    if (wealthPass.length < 4 || wealthPass.length > 32)
      return toast.error(ts("wealth.passcodeLength"));
    if (wealthPass !== wealthConfirm) return toast.error(ts("wealth.passcodeNoMatch"));
    try {
      await setWealthPass.mutateAsync(wealthPass);
      setWealthDialogOpen(false);
      toast.success(wealthMode === "change" ? ts("wealth.passcodeChanged") : ts("wealth.lockEnabled"), {
        description:
          wealthMode === "change" ? undefined : ts("wealth.lockEnabledDesc"),
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ts("wealth.passcodeUpdateFailed"));
    }
  }

  function openPasswordDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setPasswordDialogOpen(true);
  }

  async function confirmChangePassword() {
    if (me?.hasPassword && !currentPassword) return toast.error(ts("password.enterCurrent"));
    if (newPassword.length < 8) return toast.error(ts("password.minLength"));
    if (newPassword !== newPasswordConfirm) return toast.error(ts("password.noMatch"));
    try {
      await changePassword.mutateAsync({
        currentPassword: me?.hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setPasswordDialogOpen(false);
      toast.success(me?.hasPassword ? ts("password.changed") : ts("password.set"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : ts("password.updateFailed"));
    }
  }

  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    if (exportFrom) p.set("from", exportFrom);
    if (exportTo) p.set("to", new Date(`${exportTo}T23:59:59`).toISOString());
    const q = p.toString();
    return `/api/export/csv${q ? `?${q}` : ""}`;
  }, [exportFrom, exportTo]);

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same file fires onChange again
    if (!file) return;
    try {
      const result = await importFile.mutateAsync(file);
      setImportResult(result);
      if (result.imported > 0) toast.success(ts("import.imported", { count: result.imported }));
      else toast.error(ts("import.noneImported"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : ts("import.failed"));
    }
  }

  const themeOptions = [
    { value: "light", label: ts("preferences.theme.light"), icon: Sun },
    { value: "dark", label: ts("preferences.theme.dark"), icon: Moon },
    { value: "system", label: ts("preferences.theme.system"), icon: Monitor },
  ] as const;

  const pinEnabled = settings?.pinEnabled ?? false;
  const wealthLockEnabled = settings?.wealthLockEnabled ?? false;
  // Managing (change / disable) the passcode is only possible from the wealth
  // view — the everyday login can't touch it. Enabling it the first time is
  // always allowed (there's nothing to unlock yet).
  const canManageWealthLock = me?.mode === "superadmin" || !wealthLockEnabled;

  return (
    <div className="max-w-5xl">
      <PageHeader title={ts("pageTitle")} description={ts("pageDescription")} />

      {/* A rail of sections beside the page rather than ten cards in one scroll.
          The single column is deliberate: the old two-column masonry balanced by
          height, so reading order jumped between columns and a card could change
          sides as its neighbours grew. */}
      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
        <SettingsNav sections={[...SECTIONS]} />

        <div className="space-y-10">
          <SettingsSection id="account" title={ts("nav.account")} description={ts("sections.account")}>
          {/* Account hero — who's signed in, at a glance */}
          {me && (
            <Card className="surface-gradient">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center gap-4">
                  <Avatar className="h-16 w-16 border">
                    {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
                    <AvatarFallback className="text-lg font-semibold">
                      {initials(me.name, me.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-[13rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-bold">{me.name || ts("hero.yourAccount")}</h3>
                      {me.emailVerified ? (
                        <Badge variant="income" className="gap-1">
                          <BadgeCheck className="h-3 w-3" /> {ts("hero.verified")}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{ts("hero.unverified")}</Badge>
                      )}
                      {me.mode === "superadmin" && (
                        <Badge variant="secondary" className="gap-1">
                          <ShieldCheck className="h-3 w-3" /> {ts("hero.wealthView")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{me.email}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {me.hasPassword ? ts("hero.emailPassword") : ts("hero.googleAccount")}
                      {me.createdAt && (
                        <>
                          {" · "}
                          {ts("hero.memberSince", {
                            date: format(new Date(me.createdAt), "MMMM yyyy", { locale: dateFnsLocale() }),
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  {/* Settings is where people look for this. It was only ever in
                      the sidebar menu, which on a phone is behind "More". */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full shrink-0 sm:w-auto"
                    onClick={signOut}
                    disabled={logout.isPending}
                  >
                    <LogOut /> {ts("hero.signOut")}
                  </Button>
                </div>

                {/* Your data at a glance. Each one has a page, so each one goes
                    there — they looked clickable long before they were. */}
                <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat icon={Wallet} label={ts("hero.accounts")} value={accounts?.length} to="/accounts" />
                  <Stat icon={Shapes} label={ts("hero.categories")} value={categories?.length} to="/categories" />
                  <Stat icon={Trophy} label={ts("hero.goals")} value={goals?.length} to="/goals" />
                  <Stat icon={HandCoins} label={ts("hero.loans")} value={loans?.length} to="/loans" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wallet */}
          <Card>
            <CardHeader>
              <CardTitle>{ts("wallet.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="profile-name">{ts("wallet.nameLabel")}</Label>
                <Input
                  id="profile-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={ts("wallet.namePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-desc">{ts("wallet.labelLabel")}</Label>
                <Input
                  id="profile-desc"
                  value={description}
                  maxLength={120}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={ts("wallet.labelPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">
                  {ts("wallet.labelHelp")}
                </p>
              </div>
              <div className="flex justify-end">
                <Button onClick={saveProfile} disabled={!profileDirty || updateSettings.isPending}>
                  {t("actions.saveChanges")}
                </Button>
              </div>
            </CardContent>
          </Card>
          </SettingsSection>

          <SettingsSection
            id="preferences"
            title={ts("nav.preferences")}
            description={ts("sections.preferences")}
          >
          {/* Preferences */}
          <Card>
            <CardContent className="space-y-5 pt-6">
              <div className="space-y-1.5">
                <Label>{t("language.label")}</Label>
                <Select value={settings?.language ?? "en"} onValueChange={changeLanguage}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUPPORTED_LANGUAGES.map((l) => (
                      <SelectItem key={l.code} value={l.code}>
                        {l.nativeLabel}
                        {l.nativeLabel !== l.label ? ` · ${l.label}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t("language.help")}</p>
              </div>

              <div className="space-y-1.5">
                <Label>{ts("preferences.currencyLabel")}</Label>
                <Select value={settings?.baseCurrency} onValueChange={changeCurrency}>
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue placeholder={t("labels.currency")} />
                  </SelectTrigger>
                  <SelectContent>
                    {settings?.currencies.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.code} – {c.name} ({c.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ts("preferences.currencyHelp")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{ts("preferences.numberFormatLabel")}</Label>
                <Select
                  value={settings?.locale ?? "en-IN"}
                  onValueChange={changeNumberFormat}
                >
                  <SelectTrigger className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NUMBER_FORMATS.map((f) => (
                      <SelectItem key={f.locale} value={f.locale}>
                        {/* The example is the point: "Indian" and "International"
                            mean nothing next to each other, but ₹6,62,584 and
                            ₹662,584 are unmistakable. */}
                        {ts(`preferences.numberFormat.${f.key}`)} · {sampleAmount(f.locale, settings?.baseCurrency)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ts("preferences.numberFormatHelp")}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>{ts("preferences.themeLabel")}</Label>
                <div className="grid max-w-sm grid-cols-3 gap-2">
                  {themeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={theme === opt.value}
                      onClick={() => setTheme(opt.value)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors",
                        theme === opt.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent"
                      )}
                    >
                      <opt.icon className="h-5 w-5" />
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {ts("preferences.themeHelp")}
                </p>
              </div>

            </CardContent>
          </Card>

          {/* Email reports */}
          <Card>
            <CardHeader>
              <CardTitle>{ts("reports.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{ts("reports.summaryTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {ts("reports.summaryDesc")}
                  </p>
                </div>
                <Switch
                  checked={settings?.emailReports ?? true}
                  onCheckedChange={(v) => updateSettings.mutate({ emailReports: v })}
                  aria-label={ts("reports.emailReportsAria")}
                />
              </div>
              <Button variant="outline" size="sm" disabled={sendReport.isPending} onClick={sendTestReport}>
                {sendReport.isPending ? ts("reports.sending") : ts("reports.sendTest")}
              </Button>
            </CardContent>
          </Card>
          </SettingsSection>

          <SettingsSection id="security" title={ts("nav.security")} description={ts("sections.security")}>
          {/* One card, because a password, a PIN, an authenticator app and the
              Net Worth passcode are one concern. They were three cards only
              because two of them live in their own files. */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{ts("password.title")}</p>
                    <p className="text-xs text-muted-foreground">
                      {me?.hasPassword ? ts("password.changeDesc") : ts("password.setDesc")}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" onClick={openPasswordDialog}>
                  {me?.hasPassword ? ts("buttons.change") : ts("password.setPassword")}
                </Button>
              </div>

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      pinEnabled ? "bg-income/10 text-income" : "bg-muted"
                    )}
                  >
                    {pinEnabled ? <ShieldCheck className="h-5 w-5" /> : <Lock className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{ts("pin.title")}</p>
                    <p className="text-xs text-muted-foreground">
                      {pinEnabled ? ts("pin.descEnabled") : ts("pin.descDisabled")}
                    </p>
                  </div>
                </div>
                {pinEnabled ? (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openPinDialog("change")}>
                      {ts("pin.changePin")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => togglePin(false)}
                      disabled={disablePin.isPending}
                    >
                      {ts("buttons.disable")}
                    </Button>
                  </div>
                ) : (
                  <Switch checked={false} onCheckedChange={togglePin} aria-label={ts("pin.enableAria")} />
                )}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {ts("pin.info")}
              </p>

              <Separator />

              <TwoFactorSettings bare />

              <Separator />

              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg",
                      wealthLockEnabled ? "bg-primary/10 text-primary" : "bg-muted"
                    )}
                  >
                    <Landmark className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{ts("wealth.hideLabel")}</p>
                    <p className="text-xs text-muted-foreground">
                      {wealthLockEnabled ? ts("wealth.descEnabled") : ts("wealth.descDisabled")}
                    </p>
                  </div>
                </div>
                {wealthLockEnabled ? (
                  canManageWealthLock ? (
                    <div className="flex shrink-0 gap-2">
                      <Button variant="outline" size="sm" onClick={() => openWealthDialog("change")}>
                        {ts("buttons.change")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleWealthLock(false)}
                        disabled={disableWealthPass.isPending}
                      >
                        {ts("buttons.disable")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setWealthUnlockOpen(true)}
                    >
                      <ShieldCheck /> {ts("wealth.unlockToManage")}
                    </Button>
                  )
                ) : (
                  <Switch
                    checked={false}
                    onCheckedChange={toggleWealthLock}
                    aria-label={ts("wealth.enableAria")}
                  />
                )}
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {wealthLockEnabled && !canManageWealthLock
                  ? ts("wealth.infoLocked")
                  : ts("wealth.infoDefault")}
              </p>
            </CardContent>
          </Card>
          </SettingsSection>

          <SettingsSection id="people" title={ts("nav.people")} description={ts("sections.people")}>
          {/* People — who credits and shared bills are recorded against */}
          <PeopleSection />

          {/* Groups — a shortcut for the sets of people you split with regularly */}
          <GroupsSection />
          </SettingsSection>

          <SettingsSection id="data" title={ts("nav.data")} description={ts("sections.data")}>
          {/* Data */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-medium">{ts("data.exportTitle")}</p>
                <p className="text-xs text-muted-foreground">
                  {ts("data.exportDescBefore")}{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    coincompass-transactions-YYYY-MM-DD-{settings?.baseCurrency ?? "INR"}.csv
                  </code>
                  .
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="exp-from" className="text-xs">
                      {t("labels.from")}
                    </Label>
                    <Input
                      id="exp-from"
                      type="date"
                      value={exportFrom}
                      max={exportTo || undefined}
                      onChange={(e) => setExportFrom(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="exp-to" className="text-xs">
                      {t("labels.to")}
                    </Label>
                    <Input
                      id="exp-to"
                      type="date"
                      value={exportTo}
                      min={exportFrom || undefined}
                      onChange={(e) => setExportTo(e.target.value)}
                      className="w-40"
                    />
                  </div>
                  <Button variant="outline" asChild>
                    <a href={exportHref}>
                      <Download /> {ts("data.exportCsv")}
                    </a>
                  </Button>
                  {(exportFrom || exportTo) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setExportFrom("");
                        setExportTo("");
                      }}
                    >
                      {ts("data.clear")}
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm font-medium">{ts("data.importTitle")}</p>
                  <p className="text-xs text-muted-foreground">
                    {ts("data.importDesc")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{ts("data.requiredLabel")}</span>{" "}
                    {ts("data.requiredFields")} ·{" "}
                    <span className="font-medium text-foreground">{ts("data.optionalLabel")}</span>{" "}
                    {ts("data.optionalFields")}{" "}
                    <a href="/example-transactions.xlsx" download className="text-primary underline">
                      {ts("data.downloadSample")}
                    </a>
                  </p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={onImportFile}
                />
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => fileRef.current?.click()}
                  disabled={importFile.isPending}
                >
                  <Upload /> {importFile.isPending ? ts("data.importing") : t("actions.import")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* App info */}
          <Card>
            <CardHeader>
              <CardTitle>{ts("appInfo.title")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <InfoRow label={ts("appInfo.app")} value="CoinCompass" />
              <InfoRow label={ts("appInfo.version")} value={APP_VERSION} />
              <InfoRow label={ts("appInfo.build")} value={ts("appInfo.buildValue")} />
              {/* The region row is gone: currency and number format are both
                  settings now, and repeating them here as read-only text invited
                  the question of which one was in charge. */}
            </CardContent>
          </Card>
          </SettingsSection>
        </div>
      </div>


      {/* Import result dialog */}
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ts("import.completeTitle")}</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{ts("import.importedLabel")}</p>
                  <p className="text-lg font-semibold text-income">{importResult.imported}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{ts("import.skippedLabel")}</p>
                  <p
                    className={cn(
                      "text-lg font-semibold",
                      importResult.failed.length > 0 && "text-expense"
                    )}
                  >
                    {importResult.failed.length}
                  </p>
                </div>
              </div>

              {importResult.createdCategories.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {ts("import.categoriesCreated", { count: importResult.createdCategories.length })}
                  </span>{" "}
                  {importResult.createdCategories.join(", ")}
                </p>
              )}
              {importResult.createdAccounts.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {ts("import.accountsCreated", { count: importResult.createdAccounts.length })}
                  </span>{" "}
                  {importResult.createdAccounts.join(", ")}
                </p>
              )}

              {importResult.failed.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{ts("import.skippedRows")}</p>
                  <ScrollArea className="max-h-40 rounded-lg border">
                    <div className="divide-y">
                      {importResult.failed.map((f) => (
                        <div key={f.row} className="flex gap-2 px-3 py-1.5 text-xs">
                          <span className="shrink-0 font-medium text-muted-foreground">
                            {ts("import.row", { row: f.row })}
                          </span>
                          <span className="text-expense">{f.error}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResult(null)}>{t("actions.done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / change PIN dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {pinMode === "change" ? ts("pin.dialogChangeTitle") : ts("pin.dialogSetTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-pin">{ts("pin.newPinLabel")}</Label>
              <Input
                id="set-pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pin">{ts("pin.confirmLabel")}</Label>
              <Input
                id="confirm-pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && confirmPin()}
                placeholder="••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPinDialogOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={confirmPin} disabled={setPinMut.isPending}>
              <Check /> {pinMode === "change" ? ts("pin.updatePin") : ts("buttons.enable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / change wealth passcode dialog */}
      <Dialog open={wealthDialogOpen} onOpenChange={setWealthDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {wealthMode === "change" ? ts("wealth.dialogChangeTitle") : ts("wealth.dialogSetTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-wealth">{ts("wealth.passcodeLabel")}</Label>
              <Input
                id="set-wealth"
                type="password"
                autoComplete="new-password"
                maxLength={32}
                value={wealthPass}
                onChange={(e) => setWealthPassInput(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-wealth">{ts("wealth.confirmLabel")}</Label>
              <Input
                id="confirm-wealth"
                type="password"
                autoComplete="new-password"
                maxLength={32}
                value={wealthConfirm}
                onChange={(e) => setWealthConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmWealthPasscode()}
                placeholder="••••••••"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {ts("wealth.dialogHelp")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWealthDialogOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={confirmWealthPasscode} disabled={setWealthPass.isPending}>
              <Check /> {wealthMode === "change" ? t("actions.update") : ts("buttons.enable")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WealthUnlockDialog open={wealthUnlockOpen} onOpenChange={setWealthUnlockOpen} />

      {/* Change / set password dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {me?.hasPassword ? ts("password.dialogChangeTitle") : ts("password.dialogSetTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {me?.hasPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="current-password">{ts("password.currentLabel")}</Label>
                <PasswordInput
                  id="current-password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                  autoFocus
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{ts("password.newLabel")}</Label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                maxLength={200}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                autoFocus={!me?.hasPassword}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-new-password">{ts("password.confirmLabel")}</Label>
              <PasswordInput
                id="confirm-new-password"
                autoComplete="new-password"
                maxLength={200}
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmChangePassword()}
                placeholder="••••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPasswordDialogOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button onClick={confirmChangePassword} disabled={changePassword.isPending}>
              <Check /> {me?.hasPassword ? ts("password.updatePassword") : ts("password.setPassword")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/** Two-letter avatar fallback from a name (or email when unnamed). */
function initials(name: string, email: string) {
  const base = name?.trim() || email;
  return base.slice(0, 2).toUpperCase();
}

/** A representative amount in a given locale, so the choice shows its own effect. */
function sampleAmount(locale: string, currency = "INR"): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(662584);
  } catch {
    return "";
  }
}

/**
 * A compact "your data at a glance" tile, and a way in.
 *
 * Every figure here names something with a page of its own. The tiles sat in a
 * card looking like buttons and did nothing when pressed, which is a worse
 * outcome than not showing them at all.
 */
function Stat({
  icon: Icon,
  label,
  value,
  to,
}: {
  icon: LucideIcon;
  label: string;
  value: number | undefined;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-xl border bg-background/50 p-3 transition-colors hover:border-primary/40 hover:bg-background"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="tnum mt-1.5 text-2xl font-bold leading-none">{value ?? "—"}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </Link>
  );
}
