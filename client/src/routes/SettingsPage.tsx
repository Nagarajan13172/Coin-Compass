import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Info, Lock, Monitor, Moon, ShieldCheck, Sun, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useDisablePin, useSetPin, useSettings, useUpdateSettings } from "@/hooks/useSettings";
import { useSendReportEmail } from "@/hooks/useReports";
import { useImportFile } from "@/hooks/useImport";
import { ScrollArea } from "@/components/ui/scroll-area";
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

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Preferences & data" />

      <div className="space-y-5">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
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
                  money-tracker-transactions-YYYY-MM-DD-{settings?.baseCurrency ?? "INR"}.csv
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
            <InfoRow label="App" value="Money Tracker" />
            <InfoRow label="Version" value={APP_VERSION} />
            <InfoRow label="Build" value="Local build · Single user" />
            <InfoRow
              label="Region"
              value={`${settings?.baseCurrency ?? "INR"} · ${settings?.locale ?? "en-IN"}`}
            />
          </CardContent>
        </Card>
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
