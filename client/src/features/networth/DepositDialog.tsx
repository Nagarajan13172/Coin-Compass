import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/common/AmountInput";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAccounts } from "@/hooks/useAccounts";
import { useDepositToHolding, useWithdrawFromHolding } from "@/hooks/useHoldings";
import { spendableAccounts } from "@/lib/accounts";
import { formatMoney } from "@/lib/format";
import type { Holding } from "@/lib/types";

export type DepositMode = "in" | "out";

interface Props {
  holding: Holding | null;
  mode: DepositMode;
  onClose: () => void;
}

/**
 * Paying into — or taking money out of — a deposit.
 *
 * The dialog exists to make one thing obvious: this is not spending. The money
 * leaves the chosen account and arrives in the deposit, so the preview line
 * always shows both sides and says plainly that net worth doesn't move.
 *
 * Taking money out splits at the principal: anything above what was paid in is
 * interest, and that IS new money — so the preview names the two parts before
 * the user commits, rather than surprising them with an income row afterwards.
 */
export function DepositDialog({ holding, mode, onClose }: Props) {
  const { t } = useTranslation("wealth");
  const { data: allAccounts } = useAccounts();
  const accounts = spendableAccounts(allAccounts).filter((a) => !a.archived);
  const deposit = useDepositToHolding();
  const withdraw = useWithdrawFromHolding();
  const pending = deposit.isPending || withdraw.isPending;

  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [close, setClose] = useState(false);

  useEffect(() => {
    if (!holding) return;
    // A matured deposit has one obvious answer to every question this dialog
    // asks: take out everything it holds, send it where the deposit said to send
    // it, and close it. Pre-filling them isn't a shortcut — it's the difference
    // between a form and a confirmation.
    const term = holding.termCount ?? 0;
    const matured = mode === "out" && term > 0 && (holding.paid?.count ?? 0) >= term;
    const payout =
      typeof holding.payoutAccount === "string"
        ? holding.payoutAccount
        : (holding.payoutAccount?._id ?? "");

    setAmount(matured ? String(holding.value ?? 0) : "");
    setAccount(
      (mode === "out" && payout && accounts.some((a) => a._id === payout) ? payout : accounts[0]?._id) ?? ""
    );
    setDate(new Date().toISOString().slice(0, 10));
    setNote("");
    setClose(matured);
    // Re-seeding on every accounts render would fight the user's own choice, so
    // this deliberately keys off the holding the dialog was opened for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holding, mode, allAccounts]);

  const amountNum = Number(amount) || 0;
  const held = holding?.value ?? 0;
  // Mirrors splitWithdrawal on the server, so the preview and the posted legs agree.
  const principal = mode === "out" ? Math.min(amountNum, held) : amountNum;
  const interest = mode === "out" ? Math.max(0, amountNum - held) : 0;

  async function submit() {
    if (!holding) return;
    if (amountNum <= 0) return toast.error(t("deposit.enterAmount"));
    if (!account) return toast.error(t("deposit.pickAccount"));
    try {
      const payload = {
        id: holding._id,
        account,
        amount: amountNum,
        date: new Date(date).toISOString(),
        note: note.trim(),
      };
      if (mode === "in") {
        await deposit.mutateAsync(payload);
        toast.success(t("deposit.paidIn", { amount: formatMoney(amountNum), name: holding.name }));
      } else {
        const result = await withdraw.mutateAsync({ ...payload, close });
        toast.success(
          result.interest > 0
            ? t("deposit.withdrewWithInterest", {
                amount: formatMoney(result.principal),
                interest: formatMoney(result.interest),
              })
            : t("deposit.withdrew", { amount: formatMoney(result.principal), name: holding.name })
        );
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("toast.failed"));
    }
  }

  const payingIn = mode === "in";

  return (
    <Dialog open={Boolean(holding)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {payingIn ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
            {payingIn ? t("deposit.payInTitle") : t("deposit.withdrawTitle")}
          </DialogTitle>
          <DialogDescription>
            {holding && t("deposit.subtitle", { name: holding.name, value: formatMoney(held) })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="deposit-amount">{t("deposit.amount")}</Label>
            {/* Every other money field in the app groups its digits; this one
                didn't, and a pre-filled maturity payout is exactly where
                "12000" is hardest to read. */}
            <AmountInput
              id="deposit-amount"
              autoFocus
              value={amount}
              onChange={setAmount}
              placeholder={t("placeholders.eg5000")}
            />
            {!payingIn && held > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => setAmount(String(held))}
              >
                {t("deposit.wholePrincipal", { amount: formatMoney(held) })}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="deposit-account">{payingIn ? t("deposit.from") : t("deposit.into")}</Label>
              <Select value={account} onValueChange={setAccount}>
                <SelectTrigger id="deposit-account">
                  <SelectValue placeholder={t("deposit.pickAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="deposit-date">{t("deposit.date")}</Label>
              <Input id="deposit-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="deposit-note">{t("deposit.note")}</Label>
            <Input
              id="deposit-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={payingIn ? t("deposit.notePlaceholderIn") : t("deposit.notePlaceholderOut")}
            />
          </div>

          {!payingIn && (
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t("deposit.closeAfter")}</p>
                <p className="text-xs text-muted-foreground">{t("deposit.closeAfterHelp")}</p>
              </div>
              <Switch checked={close} onCheckedChange={setClose} />
            </div>
          )}

          {amountNum > 0 && (
            <div className="space-y-1 rounded-lg border bg-muted/40 p-3 text-sm">
              {payingIn ? (
                <p>{t("deposit.previewIn", { amount: formatMoney(amountNum) })}</p>
              ) : (
                <>
                  <p>{t("deposit.previewOut", { amount: formatMoney(principal) })}</p>
                  {interest > 0 && <p>{t("deposit.previewInterest", { amount: formatMoney(interest) })}</p>}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                {interest > 0 ? t("deposit.netWorthUp", { amount: formatMoney(interest) }) : t("deposit.netWorthFlat")}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t("actions.cancel", { ns: "common" })}
          </Button>
          <Button onClick={submit} disabled={pending || amountNum <= 0}>
            {pending
              ? t("states.saving", { ns: "common" })
              : payingIn
                ? t("deposit.payInSubmit")
                : t("deposit.withdrawSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
