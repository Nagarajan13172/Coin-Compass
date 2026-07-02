import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  Check,
  Download,
  HandCoins,
  Info,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  Monitor,
  Moon,
  Shapes,
  ShieldCheck,
  Sun,
  Trophy,
  Upload,
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
import { useUIStore } from "@/stores/ui";
import {
  useDisablePin,
  useSetPin,
  useSettings,
  useUpdateSettings,
  useSetWealthPasscode,
  useDisableWealthPasscode,
} from "@/hooks/useSettings";
import { useMe, useChangePassword } from "@/hooks/useAuth";
import { WealthUnlockDialog } from "@/features/settings/WealthLock";
import { TwoFactorSettings } from "@/features/settings/TwoFactorSettings";
import { useSendReportEmail } from "@/hooks/useReports";
import { useImportFile } from "@/hooks/useImport";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useGoals } from "@/hooks/useGoals";
import { useLoans } from "@/hooks/useLoans";
import type { ImportResult } from "@/lib/types";

const APP_VERSION = "1.0.0";

export default function SettingsPage() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const sendReport = useSendReportEmail();

  async function sendTestReport() {
    try {
      const r = await sendReport.mutateAsync("monthly");
      toast.success(`Report sent to ${r.sentTo}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
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
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

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
    if (!name.trim()) return toast.error("Wallet name can't be empty");
    await updateSettings.mutateAsync({ name: name.trim(), description: description.trim() });
    toast.success("Profile updated");
  }

  async function changeCurrency(code: string) {
    await updateSettings.mutateAsync({ baseCurrency: code });
    toast.success("Base currency updated");
  }

  async function changeFirstDay(v: string) {
    await updateSettings.mutateAsync({ firstDayOfWeek: Number(v) });
    toast.success("First day of week updated");
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
      toast.success("PIN lock disabled");
    }
  }

  async function confirmPin() {
    if (!/^\d{4,8}$/.test(pin)) return toast.error("PIN must be 4–8 digits");
    if (pin !== pinConfirm) return toast.error("PINs don't match");
    await setPinMut.mutateAsync(pin);
    setPinDialogOpen(false);
    toast.success(pinMode === "change" ? "PIN changed" : "PIN lock enabled");
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
      toast.success("Net Worth lock disabled", {
        description: "The Net Worth section is visible on every login now.",
      });
    }
  }

  async function confirmWealthPasscode() {
    if (wealthPass.length < 4 || wealthPass.length > 32)
      return toast.error("Passcode must be 4–32 characters");
    if (wealthPass !== wealthConfirm) return toast.error("Passcodes don't match");
    try {
      await setWealthPass.mutateAsync(wealthPass);
      setWealthDialogOpen(false);
      toast.success(wealthMode === "change" ? "Wealth passcode changed" : "Net Worth lock enabled", {
        description:
          wealthMode === "change"
            ? undefined
            : "New logins start in the everyday view; unlock with your passcode to reveal Net Worth.",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update passcode");
    }
  }

  function openPasswordDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setNewPasswordConfirm("");
    setPasswordDialogOpen(true);
  }

  async function confirmChangePassword() {
    if (me?.hasPassword && !currentPassword) return toast.error("Enter your current password");
    if (newPassword.length < 8) return toast.error("New password must be at least 8 characters");
    if (newPassword !== newPasswordConfirm) return toast.error("New passwords don't match");
    try {
      await changePassword.mutateAsync({
        currentPassword: me?.hasPassword ? currentPassword : undefined,
        newPassword,
      });
      setPasswordDialogOpen(false);
      toast.success(me?.hasPassword ? "Password changed" : "Password set");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update password");
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
      if (result.imported > 0) toast.success(`Imported ${result.imported} transaction(s)`);
      else toast.error("No transactions were imported");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

  const themeOptions = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ] as const;

  const pinEnabled = settings?.pinEnabled ?? false;
  const wealthLockEnabled = settings?.wealthLockEnabled ?? false;
  // Managing (change / disable) the passcode is only possible from the wealth
  // view — the everyday login can't touch it. Enabling it the first time is
  // always allowed (there's nothing to unlock yet).
  const canManageWealthLock = me?.mode === "superadmin" || !wealthLockEnabled;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Settings" description="Preferences & data" />

      <div className="space-y-5">
        {/* Account hero — who's signed in, at a glance */}
        {me && (
          <Card className="surface-gradient">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border">
                  {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
                  <AvatarFallback className="text-lg font-semibold">
                    {initials(me.name, me.email)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-lg font-bold">{me.name || "Your account"}</h2>
                    {me.emailVerified ? (
                      <Badge variant="income" className="gap-1">
                        <BadgeCheck className="h-3 w-3" /> Verified
                      </Badge>
                    ) : (
                      <Badge variant="outline">Unverified</Badge>
                    )}
                    {me.mode === "superadmin" && (
                      <Badge variant="secondary" className="gap-1">
                        <ShieldCheck className="h-3 w-3" /> Wealth view
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{me.email}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {me.hasPassword ? "Email & password" : "Google account"}
                    {me.createdAt && <> · Member since {format(new Date(me.createdAt), "MMMM yyyy")}</>}
                  </p>
                </div>
              </div>

              {/* Your data at a glance */}
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat icon={Wallet} label="Accounts" value={accounts?.length} />
                <Stat icon={Shapes} label="Categories" value={categories?.length} />
                <Stat icon={Trophy} label="Goals" value={goals?.length} />
                <Stat icon={HandCoins} label="Loans" value={loans?.length} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Remaining cards flow into two balanced columns on desktop so the page
            fills the width instead of stacking in one narrow strip. */}
        <div className="gap-5 lg:columns-2 [&>*]:mb-5 [&>*]:break-inside-avoid">
        {/* Wallet */}
        <Card>
          <CardHeader>
            <CardTitle>Wallet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Wallet name</Label>
              <Input
                id="profile-name"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Wallet"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-desc">Label</Label>
              <Input
                id="profile-desc"
                value={description}
                maxLength={120}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Personal finances"
              />
              <p className="text-xs text-muted-foreground">
                An optional tag shown alongside your wallet name.
              </p>
            </div>
            <div className="flex justify-end">
              <Button onClick={saveProfile} disabled={!profileDirty || updateSettings.isPending}>
                Save changes
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-1.5">
              <Label>Base currency</Label>
              <Select value={settings?.baseCurrency} onValueChange={changeCurrency}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue placeholder="Currency" />
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
                All amounts are shown in this currency. Multi-currency conversion isn’t enabled yet.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>Theme</Label>
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
                Applies instantly, on this device only.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>First day of week</Label>
              <Select value={String(settings?.firstDayOfWeek ?? 1)} onValueChange={changeFirstDay}>
                <SelectTrigger className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Monday</SelectItem>
                  <SelectItem value="0">Sunday</SelectItem>
                  <SelectItem value="6">Saturday</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used by the Calendar and weekly reports.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Email reports */}
        <Card>
          <CardHeader>
            <CardTitle>Email reports</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Monthly & mid-month summary</p>
                <p className="text-xs text-muted-foreground">
                  Emailed on the 1st (last month) and the 15th (this month so far).
                </p>
              </div>
              <Switch
                checked={settings?.emailReports ?? true}
                onCheckedChange={(v) => updateSettings.mutate({ emailReports: v })}
                aria-label="Email reports"
              />
            </div>
            <Button variant="outline" size="sm" disabled={sendReport.isPending} onClick={sendTestReport}>
              {sendReport.isPending ? "Sending…" : "Send a test report now"}
            </Button>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <KeyRound className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">Password</p>
                  <p className="text-xs text-muted-foreground">
                    {me?.hasPassword
                      ? "Change the password you sign in with."
                      : "Set a password so you can also sign in with email."}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="shrink-0" onClick={openPasswordDialog}>
                {me?.hasPassword ? "Change" : "Set password"}
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
                  <p className="text-sm font-medium">PIN lock</p>
                  <p className="text-xs text-muted-foreground">
                    {pinEnabled
                      ? "A PIN is required to open the app on this device."
                      : "Require a PIN to open the app (this device)."}
                  </p>
                </div>
              </div>
              {pinEnabled ? (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => openPinDialog("change")}>
                    Change PIN
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePin(false)}
                    disabled={disablePin.isPending}
                  >
                    Disable
                  </Button>
                </div>
              ) : (
                <Switch checked={false} onCheckedChange={togglePin} aria-label="Enable PIN lock" />
              )}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              The PIN only gates the app on your devices; your data stays intact. If you forget it,
              disable it here while the app is unlocked.
            </p>
          </CardContent>
        </Card>

        {/* Two-factor authentication */}
        <TwoFactorSettings />

        {/* Wealth lock */}
        <Card>
          <CardHeader>
            <CardTitle>Net Worth lock</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                  <p className="text-sm font-medium">Hide Net Worth behind a passcode</p>
                  <p className="text-xs text-muted-foreground">
                    {wealthLockEnabled
                      ? "Logins open in the everyday view; the Net Worth section stays hidden until unlocked."
                      : "Require a separate passcode to reveal the Net Worth section."}
                  </p>
                </div>
              </div>
              {wealthLockEnabled ? (
                canManageWealthLock ? (
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" onClick={() => openWealthDialog("change")}>
                      Change
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleWealthLock(false)}
                      disabled={disableWealthPass.isPending}
                    >
                      Disable
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setWealthUnlockOpen(true)}
                  >
                    <ShieldCheck /> Unlock to manage
                  </Button>
                )
              ) : (
                <Switch
                  checked={false}
                  onCheckedChange={toggleWealthLock}
                  aria-label="Enable Net Worth lock"
                />
              )}
            </div>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {wealthLockEnabled && !canManageWealthLock
                ? "Unlock Net Worth from the account menu to change or disable this passcode."
                : "The everyday login can be shared safely — Net Worth (holdings & net-worth totals) stays hidden until the passcode is entered. Income, expenses and cash flow are always visible."}
            </p>
          </CardContent>
        </Card>

        {/* Data */}
        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Export transactions</p>
              <p className="text-xs text-muted-foreground">
                All transactions across every account. Optionally limit to a date range. Saved as{" "}
                <code className="rounded bg-muted px-1 py-0.5">
                  coincompass-transactions-YYYY-MM-DD-{settings?.baseCurrency ?? "INR"}.csv
                </code>
                .
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="exp-from" className="text-xs">
                    From
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
                    To
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
                    <Download /> Export CSV
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
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">Import transactions</p>
                <p className="text-xs text-muted-foreground">
                  Upload a CSV or Excel (.xlsx) file. Missing categories &amp; accounts are created
                  automatically.
                </p>
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Required:</span> date, amount, type ·{" "}
                  <span className="font-medium text-foreground">Optional:</span> category, account,
                  note, payee.{" "}
                  <a href="/example-transactions.xlsx" download className="text-primary underline">
                    Download sample
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
                <Upload /> {importFile.isPending ? "Importing…" : "Import"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* App info */}
        <Card>
          <CardHeader>
            <CardTitle>App info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <InfoRow label="App" value="CoinCompass" />
            <InfoRow label="Version" value={APP_VERSION} />
            <InfoRow label="Build" value="Local build · Single user" />
            <InfoRow
              label="Region"
              value={`${settings?.baseCurrency ?? "INR"} · ${settings?.locale ?? "en-IN"}`}
            />
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Import result dialog */}
      <Dialog open={!!importResult} onOpenChange={(o) => !o && setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import complete</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Imported</p>
                  <p className="text-lg font-semibold text-income">{importResult.imported}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Skipped</p>
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
                    {importResult.createdCategories.length} categor
                    {importResult.createdCategories.length === 1 ? "y" : "ies"} created:
                  </span>{" "}
                  {importResult.createdCategories.join(", ")}
                </p>
              )}
              {importResult.createdAccounts.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {importResult.createdAccounts.length} account
                    {importResult.createdAccounts.length === 1 ? "" : "s"} created:
                  </span>{" "}
                  {importResult.createdAccounts.join(", ")}
                </p>
              )}

              {importResult.failed.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">Skipped rows</p>
                  <ScrollArea className="max-h-40 rounded-lg border">
                    <div className="divide-y">
                      {importResult.failed.map((f) => (
                        <div key={f.row} className="flex gap-2 px-3 py-1.5 text-xs">
                          <span className="shrink-0 font-medium text-muted-foreground">
                            Row {f.row}
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
            <Button onClick={() => setImportResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / change PIN dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{pinMode === "change" ? "Change PIN" : "Set a PIN"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-pin">New PIN (4–8 digits)</Label>
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
              <Label htmlFor="confirm-pin">Confirm PIN</Label>
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
              Cancel
            </Button>
            <Button onClick={confirmPin} disabled={setPinMut.isPending}>
              <Check /> {pinMode === "change" ? "Update PIN" : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set / change wealth passcode dialog */}
      <Dialog open={wealthDialogOpen} onOpenChange={setWealthDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>
              {wealthMode === "change" ? "Change wealth passcode" : "Set a wealth passcode"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="set-wealth">Passcode (4–32 characters)</Label>
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
              <Label htmlFor="confirm-wealth">Confirm passcode</Label>
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
              Keep this separate from your login password. Anyone with just the login sees everyday
              spending — never your Net Worth.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWealthDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmWealthPasscode} disabled={setWealthPass.isPending}>
              <Check /> {wealthMode === "change" ? "Update" : "Enable"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WealthUnlockDialog open={wealthUnlockOpen} onOpenChange={setWealthUnlockOpen} />

      {/* Change / set password dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{me?.hasPassword ? "Change password" : "Set a password"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {me?.hasPassword && (
              <div className="space-y-1.5">
                <Label htmlFor="current-password">Current password</Label>
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
              <Label htmlFor="new-password">New password (min 8 characters)</Label>
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
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
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
              Cancel
            </Button>
            <Button onClick={confirmChangePassword} disabled={changePassword.isPending}>
              <Check /> {me?.hasPassword ? "Update password" : "Set password"}
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

/** A compact "your data at a glance" tile. */
function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl border bg-background/50 p-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <p className="tnum mt-1.5 text-2xl font-bold leading-none">{value ?? "—"}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
