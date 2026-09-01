import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAccounts } from "@/hooks/useAccounts";
import { useRedeemFund } from "@/hooks/useFunds";
import { formatMoney } from "@/lib/format";
import type { FundPosition } from "@/lib/types";

interface Props {
  position: FundPosition | null;
  onClose: () => void;
}

/**
 * Redeem units of one holding. The oldest units go first — the AMC's own
 * convention, and what the holding-period arithmetic assumes — so the dialog
 * doesn't ask which lot: it only needs how many units and at what NAV.
 */
export function RedeemFundDialog({ position, onClose }: Props) {
  const { t } = useTranslation("funds");
  const { data: accounts } = useAccounts();
  const redeem = useRedeemFund();

  const [units, setUnits] = useState("");
  const [nav, setNav] = useState("");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fees, setFees] = useState("");

  useEffect(() => {
    if (!position) return;
    setUnits("");
    setNav(position.nav ? String(position.nav) : "");
    setAccount(accounts?.[0]?._id ?? "");
    setDate(new Date().toISOString().slice(0, 10));
    setFees("");
  }, [position, accounts]);

  const unitsNum = Number(units) || 0;
  const navNum = Number(nav) || 0;
  const proceeds = unitsNum > 0 && navNum > 0 ? unitsNum * navNum - (Number(fees) || 0) : 0;

  async function submit() {
    if (!position) return;
    if (!unitsNum) return toast.error(t("redeem.enterUnits"));
    if (unitsNum > position.units) return toast.error(t("redeem.tooMany", { held: position.units }));
    if (!account) return toast.error(t("redeem.pickAccount"));
    try {
      await redeem.mutateAsync({
        schemeCode: position.schemeCode,
        account,
        units: unitsNum,
        ...(navNum > 0 ? { nav: navNum } : {}),
        sellDate: new Date(date).toISOString(),
        fees: Number(fees) || 0,
      });
      toast.success(t("redeem.done", { name: position.name }));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("redeem.failed"));
    }
  }

  return (
    <Dialog open={Boolean(position)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("redeem.title")}</DialogTitle>
          <DialogDescription>
            {position && t("redeem.holding", { name: position.name, units: position.units })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="redeem-units">{t("redeem.units")}</Label>
              <Input
                id="redeem-units"
                inputMode="decimal"
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                placeholder={String(position?.units ?? "")}
              />
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setUnits(String(position?.units ?? ""))}
              >
                {t("redeem.all")}
              </button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="redeem-nav">{t("redeem.nav")}</Label>
              <Input
                id="redeem-nav"
                inputMode="decimal"
                value={nav}
                onChange={(e) => setNav(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="redeem-account">{t("redeem.into")}</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger id="redeem-account">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="redeem-date">{t("redeem.date")}</Label>
              <Input id="redeem-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="redeem-fees">{t("redeem.exitLoad")}</Label>
            <Input
              id="redeem-fees"
              inputMode="decimal"
              value={fees}
              onChange={(e) => setFees(e.target.value)}
              placeholder="0"
            />
          </div>

          {proceeds > 0 && (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">
              {t("redeem.proceeds", { amount: formatMoney(proceeds) })}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={redeem.isPending}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={redeem.isPending || !unitsNum}>
            {redeem.isPending ? t("states.saving", { ns: "common" }) : t("redeem.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
