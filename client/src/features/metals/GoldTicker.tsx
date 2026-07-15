import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useMetalsLatest } from "@/hooks/useMetals";
import { METAL_META } from "./meta";
import { MetalChange } from "./MetalChange";
import { DEFAULT_CITY, findCity, resolveCityRate } from "./cities";

/**
 * Compact header ticker (desktop only): today's 22K gold rate per gram with a
 * day-over-day up/down pill (green ▲ / red ▼ vs yesterday). Mirrors the
 * dashboard GoldRateCard's headline number so the two always agree. Renders
 * nothing until the metals feature is configured and has at least one snapshot.
 */
export function GoldTicker() {
  const { t } = useTranslation("credits");
  const { data: latest } = useMetalsLatest();
  const gold = latest?.gold;
  if (!latest?.configured || !gold) return null;

  const city = findCity(DEFAULT_CITY);
  const rate = resolveCityRate(gold, city);

  return (
    <Link
      to="/gold"
      aria-label={t("gold.tickerAria", { city: city.label })}
      title={t("gold.tickerAria", { city: city.label })}
      className="hidden shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 transition-colors hover:bg-accent lg:inline-flex"
    >
      <Coins className="h-4 w-4 shrink-0" style={{ color: METAL_META.gold.color }} />
      <span className="tnum text-sm font-semibold leading-none">
        {formatMoney(rate.gram22k, { currency: "INR" })}
      </span>
      <MetalChange changePct={gold.changePct} />
    </Link>
  );
}
