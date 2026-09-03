import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AmountInput } from "@/components/common/AmountInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/useAccounts";
import { fundingAccounts } from "@/lib/accounts";
import { dateFnsLocale } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { CADENCES, type CadenceKey } from "@/lib/instalments";

/**
 * The standing order that feeds a deposit, asked for on the deposit itself.
 *
 * Everything here is something the user has an opinion about: how much, from
 * where, how often, starting when. The recurring rule this builds also has a
 * type, a category and a destination account — all three are overridden when the
 * instalment posts, so asking for them would be asking for a decision with no
 * consequence. That was the old flow, and it read as three screens of noise.
 */

/** dd MMM yyyy, in the user's language — the same shape the Recurring page uses. */
const fmt = (iso: string) => format(new Date(iso), "dd MMM yyyy", { locale: dateFnsLocale() });

export interface InstalmentState {
  on: boolean;
  amount: string;
  account: string;
  cadence: CadenceKey;
  startDate: string;
}

export function InstalmentFields({
  state,
  onChange,
  /** The deposit's maturity date, which doubles as the schedule's end. */
  maturityDate,
  /** When the schedule already exists, the date the next instalment is due. */
  nextRun,
}: {
  state: InstalmentState;
  onChange: (next: InstalmentState) => void;
  maturityDate?: string;
  nextRun?: string | null;
}) {
  const { t } = useTranslation("wealth");
  const { data: accounts } = useAccounts();
  const options = fundingAccounts(accounts);
  const set = (patch: Partial<InstalmentState>) => onChange({ ...state, ...patch });

  const accountName = options.find((a) => a._id === state.account)?.name;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("instalment.title")}</p>
          <p className="text-xs text-muted-foreground">{t("instalment.subtitle")}</p>
        </div>
        <Switch
          checked={state.on}
          onCheckedChange={(on) => set({ on })}
          aria-label={t("instalment.title")}
        />
      </div>

      {state.on && (
        <div className="space-y-3 border-t pt-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="inst-amount">{t("instalment.amount")}</Label>
              <AmountInput
                id="inst-amount"
                value={state.amount}
                onChange={(v) => set({ amount: v })}
                placeholder="1,000"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("instalment.from")}</Label>
              <Select value={state.account} onValueChange={(v) => set({ account: v })}>
                <SelectTrigger id="inst-account">
                  <SelectValue placeholder={t("instalment.pickAccount")} />
                </SelectTrigger>
                <SelectContent>
                  {options.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("instalment.every")}</Label>
              <Select
                value={state.cadence}
                onValueChange={(v) => set({ cadence: v as CadenceKey })}
              >
                <SelectTrigger id="inst-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CADENCES.map((c) => (
                    <SelectItem key={c.key} value={c.key}>
                      {t(`instalment.cadence.${c.key}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inst-start">{t("instalment.starting")}</Label>
              <Input
                id="inst-start"
                type="date"
                value={state.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
              />
            </div>
          </div>

          {/* What will actually happen, in a sentence — because the mechanism
              (a transfer into an app-managed bucket) is not worth explaining,
              but the outcome is. */}
          <p className="text-xs leading-relaxed text-muted-foreground">
            {accountName && Number(state.amount) > 0
              ? t("instalment.preview", {
                  amount: formatMoney(Number(state.amount)),
                  account: accountName,
                  every: t(`instalment.cadenceLower.${state.cadence}`),
                })
              : t("instalment.previewIncomplete")}
            {maturityDate && ` ${t("instalment.until", { date: fmt(maturityDate) })}`}
          </p>
          {nextRun && (
            <p className="text-xs text-muted-foreground">
              {t("instalment.nextDue", { date: fmt(nextRun) })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
