import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Lock, Monitor, Moon, Sun, Upload } from "lucide-react";
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
import {
  useDisablePin,
  useSetPin,
  useSettings,
  useUpdateSettings,
} from "@/hooks/useSettings";
import { useImportFile } from "@/hooks/useImport";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ImportResult } from "@/lib/types";

export default function SettingsPage() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const setPin = useSetPin();
  const disablePin = useDisablePin();
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);

  const importFile = useImportFile();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (settings) setName(settings.name);
  }, [settings]);

  async function saveName() {
    await updateSettings.mutateAsync({ name });
    toast.success("Profile saved");
  }

  async function changeCurrency(code: string) {
    await updateSettings.mutateAsync({ baseCurrency: code });
    toast.success("Base currency updated");
  }

  async function changeFirstDay(v: string) {
    await updateSettings.mutateAsync({ firstDayOfWeek: Number(v) });
  }

  async function togglePin(enabled: boolean) {
    if (enabled) {
      setPinValue("");
      setPinDialogOpen(true);
    } else {
      await disablePin.mutateAsync();
      toast.success("PIN lock disabled");
    }
  }

  async function confirmPin() {
    if (!/^\d{4,8}$/.test(pinValue)) return toast.error("PIN must be 4–8 digits");
    await setPin.mutateAsync(pinValue);
    setPinDialogOpen(false);
    toast.success("PIN lock enabled");
  }

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

  return (
    <div className="max-w-2xl">
      <PageHeader title="Settings" description="Preferences & data" />

      <div className="space-y-5">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Wallet name</Label>
              <div className="flex gap-2">
                <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} />
                <Button onClick={saveName} disabled={updateSettings.isPending}>
                  Save
                </Button>
              </div>
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
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {settings?.currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.symbol} {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Theme</Label>
              <div className="grid max-w-sm grid-cols-3 gap-2">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
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
            </div>

            <div className="space-y-1.5">
              <Label>First day of week</Label>
              <Select value={String(settings?.firstDayOfWeek ?? 1)} onValueChange={changeFirstDay}>
                <SelectTrigger className="w-full sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Monday</SelectItem>
                  <SelectItem value="0">Sunday</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                  <Lock className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-medium">PIN lock</p>
                  <p className="text-xs text-muted-foreground">
                    Require a PIN to open the app (this device)
                  </p>
                </div>
              </div>
              <Switch
                checked={settings?.pinEnabled ?? false}
                onCheckedChange={togglePin}
              />
            </div>
          </CardContent>
        </Card>

        {/* Data */}
        <Card>
          <CardHeader>
            <CardTitle>Data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Export transactions</p>
                <p className="text-xs text-muted-foreground">Download all transactions as CSV</p>
              </div>
              <Button variant="outline" asChild>
                <a href="/api/export/csv">
                  <Download /> Export
                </a>
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Import transactions</p>
                <p className="text-xs text-muted-foreground">
                  Upload a CSV or Excel (.xlsx) file. Missing categories & accounts are created
                  automatically.{" "}
                  <a href="/example-transactions.xlsx" download className="text-primary underline">
                    Download sample
                  </a>
                  .
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
                onClick={() => fileRef.current?.click()}
                disabled={importFile.isPending}
              >
                <Upload /> {importFile.isPending ? "Importing…" : "Import"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <p className="px-1 text-center text-xs text-muted-foreground">
          Money Tracker · single-user local build
        </p>
      </div>

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

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Set a PIN</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="set-pin">PIN (4–8 digits)</Label>
            <Input
              id="set-pin"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pinValue}
              onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPinDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmPin} disabled={setPin.isPending}>
              <Check /> Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
