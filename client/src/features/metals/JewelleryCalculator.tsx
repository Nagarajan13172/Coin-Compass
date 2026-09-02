import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeftRight, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AmountInput } from "@/components/common/AmountInput";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  GRAMS_PER_SOVEREIGN,
  GST_PCT,
  MAKING_PRESETS,
  jewelleryCost,
  toSovereigns,
  weightForBudget,
  weightRows,
} from "./jewellery";
import type { MetalPrice } from "@/lib/types";

type Purity = "22k" | "24k" | "18k";

/**
 * What a purchase actually costs at today's counter rate — the rate itself is
 * only the metal. Making charges swing the total by thousands (a plain bangle
 * around 12%, an intricate ring 20% or more), so that percentage is the control
 * here: change it and the whole table moves.
 */
export function JewelleryCalculator({
  gold,
  silver,
  metal,
  onMetalChange,
  /** The city-resolved 22K rate from the headline card, so both agree. */
  goldRate22k,
}: {
  gold: MetalPrice | null;
  silver: MetalPrice | null;
  /** Which metal the page is looking at — shared with the chart above. */
  metal: "gold" | "silver";
  onMetalChange: (m: "gold" | "silver") => void;
  goldRate22k?: number;
}) {
  const { t } = useTranslation("credits");
  const [purity, setPurity] = useState<Purity>("22k");
  const [makingPct, setMakingPct] = useState("12");
  const [gstPct, setGstPct] = useState(String(GST_PCT));
  const [customGrams, setCustomGrams] = useState("");
  const [budget, setBudget] = useState("");
  /**
   * Which side of the converter the user typed into last. The other side is
   * derived from it, so the two can never disagree and neither field fights the
   * cursor while it's being typed in.
   */
  const [driver, setDriver] = useState<"weight" | "budget">("weight");

  const price = metal === "gold" ? gold : silver;

  /** Silver is quoted .999, so it has no purity choice to make. */
  const rate = useMemo(() => {
    if (!price) return 0;
    if (metal === "silver") return price.pricePerGram24k;
    if (purity === "22k") return goldRate22k || price.pricePerGram22k;
    if (purity === "18k") return price.pricePerGram18k;
    return price.pricePerGram24k;
  }, [price, metal, purity, goldRate22k]);

  const making = Number(makingPct) || 0;
  const gst = Number(gstPct) || 0;
  // Whichever side was typed drives the other, so the pair always agrees.
  const result =
    driver === "weight"
      ? (() => {
          const grams = Number(customGrams) || 0;
          return { grams, cost: jewelleryCost(rate, grams, making, gst), leftover: 0 };
        })()
      : weightForBudget(Number(budget) || 0, rate, making, gst);
  const weightValue = driver === "weight" ? customGrams : result.grams ? String(result.grams) : "";
  const budgetValue = driver === "budget" ? budget : result.cost.total ? String(result.cost.total) : "";

  const customWeight = result.grams;
  const rows = weightRows(customWeight, metal);

  if (!price) return null;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          {t("gold.calc.title")}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={metal} onValueChange={(v) => onMetalChange(v as "gold" | "silver")}>
            <TabsList className="h-8">
              <TabsTrigger value="gold" disabled={!gold}>
                {t("gold.metal.gold")}
              </TabsTrigger>
              <TabsTrigger value="silver" disabled={!silver}>
                {t("gold.metal.silver")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {metal === "gold" && (
            <Tabs value={purity} onValueChange={(v) => setPurity(v as Purity)}>
              <TabsList className="h-8">
                <TabsTrigger value="24k">24K</TabsTrigger>
                <TabsTrigger value="22k">22K</TabsTrigger>
                <TabsTrigger value="18k">18K</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* The three inputs that drive every row below. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="calc-making">{t("gold.calc.making")}</Label>
            <div className="relative">
              <Input
                id="calc-making"
                inputMode="decimal"
                value={makingPct}
                onChange={(e) => setMakingPct(e.target.value)}
                className="pr-7"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            {/* Starting points, not rules — every jeweller quotes differently. */}
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {MAKING_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setMakingPct(String(p.pct))}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-xs transition-colors hover:bg-accent",
                    Number(makingPct) === p.pct && "border-primary bg-primary/10 text-primary"
                  )}
                >
                  {t(`gold.calc.presets.${p.key}`)} {p.pct}%
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="calc-gst">{t("gold.calc.gst")}</Label>
            <div className="relative">
              <Input
                id="calc-gst"
                inputMode="decimal"
                value={gstPct}
                onChange={(e) => setGstPct(e.target.value)}
                className="pr-7"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                %
              </span>
            </div>
            <p className="pt-0.5 text-xs text-muted-foreground">{t("gold.calc.gstHint")}</p>
          </div>

        </div>

        <p className="tnum text-xs text-muted-foreground">
          {t("gold.calc.basedOn", {
            rate: formatMoney(rate, { currency: "INR" }),
            purity: metal === "gold" ? purity.toUpperCase() : ".999",
          })}
        </p>

        {/* Wide on a phone, so it scrolls in its own box rather than the page. */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="py-2 text-left font-medium">{t("gold.calc.col.weight")}</th>
                <th className="py-2 text-right font-medium">{t("gold.calc.col.metal")}</th>
                <th className="py-2 text-right font-medium">
                  {t("gold.calc.col.making", { pct: making })}
                </th>
                <th className="py-2 text-right font-medium">{t("gold.calc.col.beforeGst")}</th>
                <th className="py-2 text-right font-medium">{t("gold.calc.col.gst", { pct: gst })}</th>
                <th className="py-2 text-right font-medium">{t("gold.calc.col.total")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((grams) => {
                const c = jewelleryCost(rate, grams, making, gst);
                const isSovereign = metal === "gold" && grams % GRAMS_PER_SOVEREIGN === 0;
                const isCustom = grams === customWeight;
                return (
                  <tr
                    key={grams}
                    className={cn("border-b last:border-0", isCustom && "bg-primary/5")}
                  >
                    <td className="py-2.5">
                      <span className="tnum font-medium">
                        {grams >= 1000 ? t("gold.calc.kg", { kg: grams / 1000 }) : `${grams} g`}
                      </span>
                      {isSovereign && (
                        <Badge variant="secondary" className="ml-2 text-[10px] font-normal">
                          {t("gold.calc.sovereigns", { count: toSovereigns(grams) })}
                        </Badge>
                      )}
                    </td>
                    <td className="tnum py-2.5 text-right text-muted-foreground">
                      {formatMoney(c.metalValue, { currency: "INR" })}
                    </td>
                    <td className="tnum py-2.5 text-right text-muted-foreground">
                      {formatMoney(c.makingCharges, { currency: "INR" })}
                    </td>
                    <td className="tnum py-2.5 text-right font-medium">
                      {formatMoney(c.metalValue + c.makingCharges, { currency: "INR" })}
                    </td>
                    <td className="tnum py-2.5 text-right text-muted-foreground">
                      {formatMoney(c.gst, { currency: "INR" })}
                    </td>
                    <td className="tnum py-2.5 text-right font-semibold">
                      {formatMoney(c.total, { currency: "INR" })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* The converter: type either side and the other follows. The table
            above prices a fixed ladder of weights; the question at the counter
            runs both ways — "what does 3 grams cost" and "what does ₹50,000
            buy" are the same sum read from opposite ends. */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="calc-grams">{t("gold.calc.weightSide")}</Label>
              <Input
                id="calc-grams"
                inputMode="decimal"
                value={weightValue}
                onChange={(e) => {
                  setCustomGrams(e.target.value);
                  setDriver("weight");
                }}
                placeholder={t("gold.calc.customPlaceholder")}
              />
            </div>
            <div className="flex items-center justify-center pb-2.5 text-muted-foreground">
              <ArrowLeftRight className="h-4 w-4" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="calc-budget">{t("gold.calc.amountSide")}</Label>
              <AmountInput
                id="calc-budget"
                value={budgetValue}
                onChange={(v) => {
                  setBudget(v);
                  setDriver("budget");
                }}
                placeholder="50,000"
              />
            </div>
          </div>

          {result.grams > 0 ? (
            <div className="mt-3 border-t pt-3">
              <p className="tnum text-base font-semibold leading-tight">
                {t("gold.calc.budgetBuys", { grams: result.grams })}
                {metal === "gold" && (
                  <span className="ml-2 text-sm font-medium text-muted-foreground">
                    {t("gold.calc.sovereigns", { count: toSovereigns(result.grams) })}
                  </span>
                )}
                <span className="mx-2 text-muted-foreground">=</span>
                {formatMoney(result.cost.total, { currency: "INR" })}
              </p>
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {t("gold.calc.budgetBreakdown", {
                  metal: formatMoney(result.cost.metalValue, { currency: "INR" }),
                  making: formatMoney(result.cost.makingCharges, { currency: "INR" }),
                  gst: formatMoney(result.cost.gst, { currency: "INR" }),
                  total: formatMoney(result.cost.total, { currency: "INR" }),
                })}
              </p>
              {/* Only meaningful coming from a budget: what you'd walk out with. */}
              {driver === "budget" && result.leftover > 0 && (
                <p className="tnum mt-0.5 text-xs text-muted-foreground">
                  {t("gold.calc.budgetLeftover", {
                    amount: formatMoney(result.leftover, { currency: "INR" }),
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
              {t("gold.calc.converterHint")}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("gold.calc.footnote", {
            perGram: formatMoney(jewelleryCost(rate, 1, making, gst).total, { currency: "INR" }),
          })}
        </p>
      </CardContent>
    </Card>
  );
}
