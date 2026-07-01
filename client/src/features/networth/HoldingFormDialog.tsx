import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateHolding, useUpdateHolding } from "@/hooks/useHoldings";
import { useSettings } from "@/hooks/useSettings";
import { SAVING_SUBTYPES, INVESTMENT_SUBTYPES } from "@/lib/networth";
import type { Holding, HoldingClass, HoldingSubtype } from "@/lib/types";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  holding?: Holding | null;
}

export function HoldingFormDialog({ open, onOpenChange, holding }: Props) {
  const { data: settings } = useSettings();
  const create = useCreateHolding();
  const update = useUpdateHolding();
  const isEdit = Boolean(holding);

  const [name, setName] = useState("");
  const [cls, setCls] = useState<HoldingClass>("saving");
  const [subtype, setSubtype] = useState<HoldingSubtype>("fixed_deposit");
  const [value, setValue] = useState("");
  const [provider, setProvider] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(holding?.name ?? "");
    setCls(holding?.class ?? "saving");
    setSubtype(holding?.subtype ?? "fixed_deposit");
    setValue(holding ? String(holding.value) : "");
    setProvider(holding?.provider ?? "");
  }, [open, holding]);

  const subtypes = cls === "saving" ? SAVING_SUBTYPES : INVESTMENT_SUBTYPES;

  function changeClass(next: HoldingClass) {
    setCls(next);
    // keep a valid subtype for the new class
    const list = next === "saving" ? SAVING_SUBTYPES : INVESTMENT_SUBTYPES;
    if (!list.some((s) => s.value === subtype)) setSubtype(list[0].value);
  }

  async function submit() {
    if (!name.trim()) return toast.error("Enter a name");
    const v = Number(value);
    if (!(v >= 0)) return toast.error("Enter a valid value");
    const payload = {
      name: name.trim(),
      class: cls,
      subtype,
      value: v,
      provider: provider.trim(),
      currency: settings?.baseCurrency ?? "INR",
    };
    try {
      if (isEdit && holding) {
        await update.mutateAsync({ id: holding._id, ...payload });
        toast.success("Asset updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Asset added");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit asset" : "Add asset"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="hold-name">Name</Label>
            <Input
              id="hold-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. HDFC FD / Nifty index fund / Gold coins"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={cls} onValueChange={(v) => changeClass(v as HoldingClass)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saving">Saving</SelectItem>
                  <SelectItem value="investment">Investment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={subtype} onValueChange={(v) => setSubtype(v as HoldingSubtype)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {subtypes.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-value">Current value</Label>
            <Input
              id="hold-value"
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="100000"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hold-provider">Provider / institution</Label>
            <Input
              id="hold-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Optional (e.g. HDFC Bank, Zerodha)"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending || update.isPending}>
            {isEdit ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
